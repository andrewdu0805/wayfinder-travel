'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  AppSettings,
  CategoryConfig,
  SavedPlace,
  UpsertActionRecord,
} from '@/types/place';
import {
  DEFAULT_CATEGORY_CONFIGS,
  INITIAL_SAVED_PLACES,
} from '@/lib/default-data';
import {
  ALL_TAIWAN_CITY_DISTRICTS,
  cleanStoreName,
  diagnosePlaceCategory,
  extractCoordsFromGoogleMapsUrl,
  extractRegionFromAddress,
  getCoordinatesForRegion,
  inferPlaceCategoryByName,
  isTaiwaneseStreetFood,
  separateNameAndAddress,
} from '@/lib/geo-utils';
import { resolvePlaceDescription } from '@/lib/place-notes';
import { normalizeOpeningHoursForStorage } from '@/lib/opening-hours';

const STORAGE_KEYS = {
  PLACES: 'antigravity_travel_places_v1',
  CATEGORIES: 'antigravity_travel_categories_v1',
  SETTINGS: 'antigravity_travel_settings_v1',
  DELETED_PLACES: 'antigravity_deleted_places_v1',
  DELETED_CATEGORIES: 'antigravity_deleted_categories_v1',
  LAST_SYNCED_PLACE_IDS: 'antigravity_last_synced_place_ids_v1',
  LAST_SYNCED_AT: 'antigravity_last_synced_at_v1',
  HAS_SYNCED_ONCE: 'antigravity_has_synced_once_v1',
  HAS_LOCAL_MUTATION: 'antigravity_has_local_mutation_v1',
  STREET_FOOD_MIGRATED: 'antigravity_street_food_migrated_v1',
  ALL_CATEGORIES_VERIFIED: 'antigravity_all_categories_verified_v2',
};

const DEFAULT_PLACE_MAP = new Map<string, SavedPlace>(
  INITIAL_SAVED_PLACES.map((p) => [p.google_place_id, p])
);

const DEFAULT_CATEGORY_MAP = new Map<string, CategoryConfig>(
  DEFAULT_CATEGORY_CONFIGS.map((c) => [c.sub_category, c])
);

function verifyPlaceCategorySingle(
  p: SavedPlace,
  activeCats: CategoryConfig[],
  deletedCatSubs: Set<string>,
  nowIso: string
): { updated: SavedPlace; oldLabel: string; newLabel: string } | null {
  if (!DEFAULT_CATEGORY_MAP.has(p.sub_category)) return null;

  const diag = diagnosePlaceCategory(p.name, p.user_notes, p.custom_tags);
  if (!diag.isExplicitMatch) return null;
  if (deletedCatSubs.has(diag.sub_category)) return null;
  if (
    diag.sub_category === p.sub_category &&
    diag.primary_category === p.primary_category
  ) {
    return null;
  }

  const targetCfg = activeCats.find((c) => c.sub_category === diag.sub_category);
  const oldLabel =
    activeCats.find((c) => c.sub_category === p.sub_category)?.sub_label ||
    DEFAULT_CATEGORY_MAP.get(p.sub_category)?.sub_label ||
    p.sub_category;
  const newLabel =
    targetCfg?.sub_label ||
    DEFAULT_CATEGORY_MAP.get(diag.sub_category)?.sub_label ||
    diag.sub_category;
  const nextStay = targetCfg?.default_stay_mins ?? diag.estimated_stay_mins;

  let nextNotes = p.user_notes || '';
  if (
    diag.primary_category !== 'restaurant' &&
    /這家餐廳|餐點美味|招牌主食|老饕喜愛/.test(nextNotes)
  ) {
    nextNotes = resolvePlaceDescription(
      p.name,
      p.city,
      p.district,
      diag.sub_category,
      p.formatted_address
    );
  }

  return {
    updated: {
      ...p,
      primary_category: diag.primary_category,
      sub_category: diag.sub_category,
      estimated_stay_mins: nextStay,
      user_notes: nextNotes,
      updated_at: nowIso,
    },
    oldLabel,
    newLabel,
  };
}

function normalizeSupabaseUrl(raw?: string | null): string {
  const cleaned = (raw || '').replace(/[\u200B-\u200D\uFEFF\s]+/g, '');
  if (!cleaned) return '';
  const supabaseMatch = cleaned.match(/https?:\/\/[a-z0-9-]+\.supabase\.co/i);
  if (supabaseMatch) {
    return supabaseMatch[0].toLowerCase();
  }
  try {
    const withProto = /^https?:\/\//i.test(cleaned)
      ? cleaned
      : `https://${cleaned}`;
    return new URL(withProto).origin;
  } catch {
    return cleaned.replace(/\/+$/, '');
  }
}

function cleanApiKey(raw?: string | null): string {
  return (raw || '').replace(/[\u200B-\u200D\uFEFF\s]+/g, '');
}

function toCanonicalGooglePlaceId(p: SavedPlace): string {
  const raw = (p.google_place_id || '').trim();
  return raw || `local_${p.id}`;
}

function parseTimestampMs(iso?: string | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function isUnmodifiedDefaultPlace(p: SavedPlace): boolean {
  const def = DEFAULT_PLACE_MAP.get(p.google_place_id);
  if (!def) return false;
  return (
    p.name === def.name &&
    p.visit_status === def.visit_status &&
    p.user_notes === def.user_notes &&
    p.sub_category === def.sub_category &&
    p.primary_category === def.primary_category &&
    p.estimated_stay_mins === def.estimated_stay_mins &&
    p.formatted_address === def.formatted_address &&
    JSON.stringify(p.custom_tags || []) === JSON.stringify(def.custom_tags || [])
  );
}

function isUnmodifiedDefaultCategory(c: CategoryConfig): boolean {
  const def = DEFAULT_CATEGORY_MAP.get(c.sub_category);
  if (!def) return false;
  return (
    c.primary_category === def.primary_category &&
    c.primary_label === def.primary_label &&
    c.sub_label === def.sub_label &&
    c.default_stay_mins === def.default_stay_mins &&
    c.sort_order === def.sort_order
  );
}

function placeToSupabaseRow(p: SavedPlace) {
  const lat =
    typeof p.latitude === 'number' && Number.isFinite(p.latitude)
      ? p.latitude
      : 22.9918;
  const lng =
    typeof p.longitude === 'number' && Number.isFinite(p.longitude)
      ? p.longitude
      : 120.2008;
  const nowIso = new Date().toISOString();
  return {
    google_place_id: toCanonicalGooglePlaceId(p),
    name: p.name,
    formatted_address: p.formatted_address || '',
    country: p.country || '台灣',
    city: p.city || '台南市',
    district: p.district || '',
    location: `SRID=4326;POINT(${lng} ${lat})`,
    primary_category: p.primary_category || 'restaurant',
    sub_category: p.sub_category || 'meal',
    visit_status: p.visit_status || 'unvisited',
    business_status: p.business_status || 'OPERATIONAL',
    estimated_stay_mins: Math.max(
      5,
      Math.round(Number(p.estimated_stay_mins) || 60)
    ),
    rating:
      typeof p.rating === 'number' && Number.isFinite(p.rating)
        ? Number(p.rating.toFixed(1))
        : null,
    opening_hours_json: normalizeOpeningHoursForStorage(p.opening_hours_json),
    google_maps_url: p.google_maps_url || '',
    user_notes: p.user_notes || '',
    custom_tags: Array.isArray(p.custom_tags) ? p.custom_tags : [],
    last_visited_at: p.last_visited_at
      ? String(p.last_visited_at).slice(0, 10)
      : null,
    hours_updated_at: p.hours_updated_at || nowIso,
    created_at: p.created_at || nowIso,
    updated_at: p.updated_at || nowIso,
  };
}

function supabaseRowToPlace(row: Record<string, unknown>): SavedPlace {
  const nowIso = new Date().toISOString();
  const visitStatus =
    row.visit_status === 'visited_revisit' ||
    row.visit_status === 'visited_skip'
      ? row.visit_status
      : 'unvisited';
  const businessStatus =
    row.business_status === 'CLOSED_TEMPORARILY' ||
    row.business_status === 'CLOSED_PERMANENTLY'
      ? row.business_status
      : 'OPERATIONAL';

  return {
    id: String(row.id || `sb-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    google_place_id: String(row.google_place_id || row.id || ''),
    name: String(row.name || '未命名地點'),
    formatted_address: String(row.formatted_address || ''),
    country: String(row.country || '台灣'),
    city: String(row.city || '台南市'),
    district: String(row.district || ''),
    latitude:
      typeof row.latitude === 'number'
        ? row.latitude
        : Number(row.latitude) || 22.9918,
    longitude:
      typeof row.longitude === 'number'
        ? row.longitude
        : Number(row.longitude) || 120.2008,
    primary_category: String(row.primary_category || 'restaurant'),
    sub_category: String(row.sub_category || 'meal'),
    visit_status: visitStatus,
    business_status: businessStatus,
    estimated_stay_mins: Number(row.estimated_stay_mins) || 60,
    rating:
      row.rating !== null && row.rating !== undefined && !Number.isNaN(Number(row.rating))
        ? Number(row.rating)
        : null,
    opening_hours_json:
      (row.opening_hours_json as SavedPlace['opening_hours_json']) || null,
    google_maps_url: String(row.google_maps_url || ''),
    user_notes: String(row.user_notes || ''),
    custom_tags: Array.isArray(row.custom_tags)
      ? row.custom_tags.map(String)
      : [],
    last_visited_at: row.last_visited_at ? String(row.last_visited_at) : null,
    hours_updated_at: String(row.hours_updated_at || nowIso),
    created_at: String(row.created_at || nowIso),
    updated_at: String(row.updated_at || nowIso),
  };
}

const DEFAULT_SETTINGS: AppSettings = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  geminiApiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || '',
  autoRefreshHoursOnPlan: true,
  defaultTravelMode: 'WALK',
  defaultRadiusMeters: 5000,
};

export interface PlaceAuditProgress {
  current: number;
  total: number;
  fixedCount: number;
  fixedDetails: string[];
  done: boolean;
}

interface PlacesContextValue {
  places: SavedPlace[];
  categoryConfigs: CategoryConfig[];
  settings: AppSettings;
  recentUpserts: UpsertActionRecord[];
  isHydrated: boolean;
  isSyncing: boolean;
  isSupabaseConfigured: boolean;
  lastSyncMessage: string | null;
  lastSyncError: string | null;
  lastSyncedAt: string | null;
  clearSyncFeedback: () => void;
  isAuditingPlaces: boolean;
  auditProgress: PlaceAuditProgress | null;
  clearAuditProgress: () => void;
  auditAndFixAllPlaces: (
    targetCity?: string
  ) => Promise<{ totalChecked: number; fixedCount: number }>;
  smartUpsertPlaces: (incoming: SavedPlace[]) => UpsertActionRecord[];
  importPlacesFromJson: (
    incoming: SavedPlace[],
    incomingCategories?: CategoryConfig[]
  ) => number;
  updatePlaceInline: (id: string, patch: Partial<SavedPlace>) => void;
  deletePlace: (id: string) => void;
  clearRecentUpserts: () => void;
  addCategoryConfig: (config: Omit<CategoryConfig, 'id' | 'sort_order'>) => void;
  updateCategoryConfig: (id: string, patch: Partial<CategoryConfig>) => void;
  deleteCategoryConfig: (id: string) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  importSettingsCode: (codeOrUrl: string) => boolean;
  refreshPlacesHours: (targetPlaces: SavedPlace[]) => Promise<number>;
  reclassifyStreetFoodFromMeals: () => number;
  verifyAllPlacesCategories: (
    targetCity?: string
  ) => { totalChecked: number; fixedCount: number; fixedDetails: string[] };
  syncWithSupabase: () => Promise<{ ok: boolean; message: string }>;
  resetToDemoData: () => void;
}

const PlacesContext = createContext<PlacesContextValue | undefined>(undefined);

function normalizePlaceName(name: string): string {
  return name
    .replace(/\([^)]*\)|（[^）]*）|【[^】]*】/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function sanitizePlaceRecord(p: SavedPlace): SavedPlace {
  const sep = separateNameAndAddress(p.name);
  let nextName = cleanStoreName(p.name) || p.name;
  let nextAddr = p.formatted_address || '';
  let nextCity = p.city;
  let nextDist = p.district;
  let nextLat = p.latitude;
  let nextLng = p.longitude;
  let nextPrimary = p.primary_category;
  let nextSub = p.sub_category;
  let nextStay = p.estimated_stay_mins;
  let nextNotes = p.user_notes || '';

  const isImportedRecord =
    p.id?.startsWith('csv-') ||
    p.id?.startsWith('takeout-') ||
    p.google_place_id?.startsWith('csv_') ||
    p.google_place_id?.startsWith('takeout_') ||
    p.custom_tags?.includes('#CSV匯入') ||
    p.custom_tags?.includes('#Takeout匯入');

  let decodedUrlText = '';
  try {
    decodedUrlText = decodeURIComponent(p.google_maps_url || '');
  } catch {
    decodedUrlText = p.google_maps_url || '';
  }

  // 1. If google_maps_url contains an S2CellId (!1s0x34...:0x...) or @lat,lng, extract exact building coordinates!
  const urlCoords = extractCoordsFromGoogleMapsUrl(p.google_maps_url || '');
  if (urlCoords) {
    nextLat = urlCoords.lat;
    nextLng = urlCoords.lng;
  }

  // 2. Check if formatted_address is just a generic city/district placeholder without any street/road/number
  const hasSpecificHouseNumber = /[0-9]+號/.test(nextAddr);
  const isPlaceholderAddr =
    !nextAddr ||
    nextAddr === '台灣高雄市鹽埕區' ||
    !/[路街段巷弄號大道村里丁目番地]/.test(nextAddr) ||
    (!hasSpecificHouseNumber && (nextAddr.includes('永康區') || nextAddr.includes('鹽埕區')));

  if (sep.foundAddress && sep.cleanName && sep.cleanName !== p.name) {
    nextName = cleanStoreName(sep.cleanName) || sep.cleanName;
    if (
      isPlaceholderAddr ||
      nextAddr.includes('鹽埕區臺南市') ||
      nextAddr.includes('鹽埕區台南市') ||
      nextAddr.includes('市中心') ||
      nextAddr.includes(p.name) ||
      nextAddr.length < 5
    ) {
      nextAddr = sep.foundAddress;
    }
  }

  // 3. Detect true region from full text + coordinates
  // CRITICAL: Do NOT include nextAddr if it is a placeholder (e.g. '台灣台北市大安區' or '台灣高雄市鹽埕區'),
  // otherwise the old placeholder city/district will override coordinate/name detection!
  const addressTextForDetection = [
    sep.foundAddress || '',
    isPlaceholderAddr ? (nextCity ? `${nextCity} ${nextDist}` : '') : nextAddr,
    nextName,
    p.name,
    p.user_notes || '',
    decodedUrlText,
  ]
    .filter(Boolean)
    .join(' ');

  if (urlCoords) {
    nextLat = urlCoords.lat;
    nextLng = urlCoords.lng;
  }

  const coordsForDetection =
    urlCoords ||
    (nextLat && nextLng && nextLat > 20 && nextLat < 27
      ? { lat: nextLat, lng: nextLng }
      : null);

  const reg = extractRegionFromAddress(
    addressTextForDetection,
    coordsForDetection,
    nextCity || '台南市'
  );

  if (reg.city && reg.district) {
    nextCity = reg.city;
    nextDist = reg.district;
  }

  // Self-heal invalid district === city (e.g. 桃園市・桃園市 -> 桃園市・桃園區)
  if (nextDist && nextCity && nextDist === nextCity) {
    const validDists = ALL_TAIWAN_CITY_DISTRICTS[nextCity] || [];
    nextDist =
      validDists[0] ||
      (nextCity.endsWith('市') ? nextCity.replace(/市$/, '區') : nextDist);
    if (nextAddr.includes(`${nextCity}${nextCity}`)) {
      nextAddr = nextAddr.replace(`${nextCity}${nextCity}`, `${nextCity}${nextDist}`);
    }
  }

  if (isImportedRecord && isPlaceholderAddr) {
    nextAddr =
      sep.foundAddress || `${reg.country}${nextCity}${nextDist}`;
    if (!urlCoords) {
      const newCoords = getCoordinatesForRegion(nextCity, nextDist, nextName);
      nextLat = newCoords.lat;
      nextLng = newCoords.lng;
    }
    const inferredCat = inferPlaceCategoryByName(nextName);
    if (nextPrimary === 'restaurant' && nextSub === 'meal') {
      nextPrimary = inferredCat.primary_category;
      nextSub = inferredCat.sub_category;
      nextStay = inferredCat.estimated_stay_mins;
    }
  }

  // Clean up formatted_address if it still has old placeholder "市中心"
  if (nextAddr.includes('市中心') && nextDist !== '市中心') {
    nextAddr = nextAddr.replace('市中心', nextDist);
  }

  // 4. Critical Hotspot Self-Healing: explicitly repair known hotspots that were erroneously assigned to the wrong district or coordinates
  if (
    nextName.includes('酣呷') ||
    nextName.includes('The Han Jia') ||
    nextName.includes('The Han-Jia')
  ) {
    nextCity = '台南市';
    nextDist = '南區';
    nextLat = 22.9868;
    nextLng = 120.1979;
    nextAddr = '702臺南市南區新昌里西門路一段669號';
  } else if (
    nextName.includes('下林米糕') ||
    (nextName.includes('下林') && nextCity === '台南市')
  ) {
    nextCity = '台南市';
    nextDist = '南區';
    nextLat = 22.9842;
    nextLng = 120.1956;
    if (isPlaceholderAddr || !hasSpecificHouseNumber) {
      nextAddr = '702臺南市南區夏林路67號';
    }
  } else if (
    nextName.includes('總爺') ||
    nextName.includes('麻豆總爺')
  ) {
    nextCity = '台南市';
    nextDist = '麻豆區';
    nextLat = 23.1873;
    nextLng = 120.2599;
    if (isPlaceholderAddr || !hasSpecificHouseNumber) {
      nextAddr = '721臺南市麻豆區南勢里總爺5號';
    }
    // Only auto-correct category if it was defaulted to generic meal/restaurant!
    // If the user already manually changed it to another category, leave it untouched!
    if (nextPrimary === 'restaurant' && nextSub === 'meal') {
      nextPrimary = 'museum_culture';
      nextSub = 'landmark';
      nextStay = 90;
    }
  } else if (
    nextName.includes('西市場') ||
    nextName.includes('大菜市') ||
    nextName.includes('西門市場')
  ) {
    if (
      nextCity === '嘉義市' ||
      !nextCity ||
      isPlaceholderAddr ||
      nextAddr.includes('嘉義') ||
      nextDist === '西區'
    ) {
      nextCity = '台南市';
      nextDist = '中西區';
      nextLat = 22.9933;
      nextLng = 120.1982;
      nextAddr = '700臺南市中西區西門路二段177號';
      if (nextPrimary === 'restaurant' && nextSub === 'meal') {
        nextPrimary = 'museum_culture';
        nextSub = 'landmark';
        nextStay = 60;
      }
      nextNotes = '台南百年市定古蹟大菜市，日治時期經典木構洋樓建築，匯集傳統老字號甜品冰品與正興街文創商圈';
    }
  } else if (
    nextCity === '台南市' &&
    nextDist === '永康區' &&
    (nextName.includes('西門路') ||
      nextName.includes('新昌里') ||
      nextName.includes('夏林路') ||
      nextName.includes('水交社') ||
      nextName.includes('阿銘牛肉麵'))
  ) {
    nextCity = '台南市';
    nextDist = '南區';
    const newCoords = getCoordinatesForRegion(nextCity, nextDist, nextName);
    nextLat = newCoords.lat;
    nextLng = newCoords.lng;
  } else if (!urlCoords) {
    if (nextCity === '台南市' && nextDist === '南區' && nextLat > 23.00) {
      const newCoords = getCoordinatesForRegion(nextCity, nextDist, nextName);
      nextLat = newCoords.lat;
      nextLng = newCoords.lng;
    }
  }

  // 4.5. Auto-correct erroneously classified categories:
  // A. If an eatery/food place was mistakenly classified as 'trail' (e.g. Mon Poulet in 鼓山區 matched old loose /山/ regex):
  if (nextSub === 'trail' || nextPrimary === 'nature_outdoor') {
    const isRealTrail =
      /登山步道|登山|步道|健行|步徑|林道|古道|森林公園|國家公園|風景區|自然保留區|森林遊樂區|大峽谷|瀑布|海灘|海水浴場|海岸風景|觀景台|瞭望台|神木|露營區/.test(
        nextName
      );
    if (!isRealTrail) {
      const properCat = inferPlaceCategoryByName(nextName);
      nextPrimary = properCat.primary_category;
      nextSub = properCat.sub_category;
      nextStay = properCat.estimated_stay_mins;
    }
  }

  // B. If a culture/landmark/bar/dessert place was defaulted to 'restaurant / meal':
  // (Note: 'street_food' split is handled via versioned migration / manual rescan so user's manual 'meal' choice is preserved!)
  if (nextPrimary === 'restaurant' && nextSub === 'meal') {
    const inferredCat = inferPlaceCategoryByName(nextName);
    if (
      inferredCat.sub_category !== 'meal' &&
      inferredCat.sub_category !== 'street_food'
    ) {
      nextPrimary = inferredCat.primary_category;
      nextSub = inferredCat.sub_category;
      nextStay = inferredCat.estimated_stay_mins;
    }
  }

  // 5. Google Maps-style Note & Description Auto-Resolution:
  // If notes are empty, generic import placeholders like "由 CSV 清單匯入", or the old boilerplate sentence,
  // automatically resolve a rich authentic Google Maps description!
  // ALSO: Self-heal cross-district notes mismatch (e.g. 新化區 store previously erroneously assigned 國華街 note)
  if (!nextNotes) nextNotes = p.user_notes || '';
  const hasCrossDistrictConflict =
    (nextDist !== '中西區' && nextNotes.includes('國華街')) ||
    (nextDist !== '中西區' && nextNotes.includes('保安路')) ||
    (nextDist !== '南區' && nextNotes.includes('夏林路')) ||
    (nextDist !== '北區' && nextNotes.includes('崇安街')) ||
    (nextDist !== '安平區' && nextNotes.includes('安平'));

  const isCategoryMismatchNote =
    (nextPrimary !== 'restaurant' &&
      (nextNotes.includes('這家餐廳的餐點美味') ||
        nextNotes.includes('特別是招牌主食、特調醬汁'))) ||
    (nextSub === 'museum' &&
      nextNotes.includes('參觀者表示這座文化展館的展覽內容豐富且策展用心'));

  const isOldBoilerplate =
    isCategoryMismatchNote ||
    nextNotes.includes('Google Maps 在地高評價推薦熱點') ||
    nextNotes.includes('深獲旅人與老饕喜愛') ||
    nextNotes.includes('由 CSV 清單匯入') ||
    nextNotes.includes('由 Google Takeout 匯入') ||
    nextNotes.includes('透過智慧快速輸入新增') ||
    nextNotes.includes('以特色調酒與創意下酒料理聞名') ||
    nextNotes.includes('以特色原創調酒與精緻下酒料理聞名') ||
    nextNotes.includes('在地人氣餐酒酒吧') ||
    nextNotes.includes('人氣餐酒酒吧') ||
    nextNotes.includes('超人氣異國風味料理餐館') ||
    nextNotes.includes('在地排隊經典傳統麵攤') ||
    nextNotes.includes('人氣招牌烤雞與經典禽肉名店');

  if (!nextNotes || isOldBoilerplate || hasCrossDistrictConflict) {
    nextNotes = resolvePlaceDescription(
      nextName,
      nextCity,
      nextDist,
      nextSub,
      nextAddr
    );
  }

  return {
    ...p,
    name: nextName,
    formatted_address: nextAddr || p.formatted_address,
    city: nextCity,
    district: nextDist,
    latitude: nextLat,
    longitude: nextLng,
    primary_category: nextPrimary,
    sub_category: nextSub,
    estimated_stay_mins: nextStay,
    user_notes: nextNotes,
  };
}

export function PlacesProvider({ children }: { children: React.ReactNode }) {
  const [places, setPlaces] = useState<SavedPlace[]>(INITIAL_SAVED_PLACES);
  const [categoryConfigs, setCategoryConfigs] = useState<CategoryConfig[]>(
    DEFAULT_CATEGORY_CONFIGS
  );
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [recentUpserts, setRecentUpserts] = useState<UpsertActionRecord[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState<string | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [isAuditingPlaces, setIsAuditingPlaces] = useState(false);
  const [auditProgress, setAuditProgress] = useState<PlaceAuditProgress | null>(
    null
  );

  const placesRef = React.useRef<SavedPlace[]>(places);
  const categoryConfigsRef = React.useRef<CategoryConfig[]>(categoryConfigs);
  const settingsRef = React.useRef<AppSettings>(settings);
  const isSyncingRef = React.useRef<boolean>(false);
  const lastSyncCompletedAtRef = React.useRef<number>(0);
  const initialSyncTriggeredRef = React.useRef<boolean>(false);
  const autoPushTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const deletedPlaceIdsRef = React.useRef<Set<string>>(new Set());
  const deletedCategorySubsRef = React.useRef<Set<string>>(new Set());
  const syncWithSupabaseRef = React.useRef<
    (() => Promise<{ ok: boolean; message: string }>) | null
  >(null);

  useEffect(() => {
    placesRef.current = places;
  }, [places]);

  useEffect(() => {
    categoryConfigsRef.current = categoryConfigs;
  }, [categoryConfigs]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const isSupabaseConfigured = useMemo(
    () =>
      Boolean(
        settings.supabaseUrl?.trim() &&
          settings.supabaseAnonKey?.trim() &&
          !settings.supabaseUrl.includes('your-project-id')
      ),
    [settings.supabaseUrl, settings.supabaseAnonKey]
  );

  const isSupabaseConfiguredRef = React.useRef<boolean>(isSupabaseConfigured);
  useEffect(() => {
    isSupabaseConfiguredRef.current = isSupabaseConfigured;
  }, [isSupabaseConfigured]);

  const clearAuditProgress = useCallback(() => setAuditProgress(null), []);
  const clearSyncFeedback = useCallback(() => {
    setLastSyncMessage(null);
    setLastSyncError(null);
  }, []);

  const persistDeletedQueues = useCallback(() => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.DELETED_PLACES,
        JSON.stringify(Array.from(deletedPlaceIdsRef.current))
      );
      localStorage.setItem(
        STORAGE_KEYS.DELETED_CATEGORIES,
        JSON.stringify(Array.from(deletedCategorySubsRef.current))
      );
    } catch {}
  }, []);

  const scheduleAutoPush = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.HAS_LOCAL_MUTATION, '1');
    } catch {}
    if (!isSupabaseConfiguredRef.current) return;
    if (autoPushTimerRef.current) {
      clearTimeout(autoPushTimerRef.current);
    }
    autoPushTimerRef.current = setTimeout(() => {
      autoPushTimerRef.current = null;
      if (syncWithSupabaseRef.current) {
        void syncWithSupabaseRef.current();
      }
    }, 1500);
  }, []);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (autoPushTimerRef.current) {
        clearTimeout(autoPushTimerRef.current);
      }
    };
  }, []);

  // Hydrate from localStorage on client mount
  useEffect(() => {
    try {
      const rawDeletedPlaces = localStorage.getItem(
        STORAGE_KEYS.DELETED_PLACES
      );
      if (rawDeletedPlaces) {
        const parsedDel = JSON.parse(rawDeletedPlaces);
        if (Array.isArray(parsedDel)) {
          deletedPlaceIdsRef.current = new Set(parsedDel.map(String));
        }
      }
      const rawDeletedCats = localStorage.getItem(
        STORAGE_KEYS.DELETED_CATEGORIES
      );
      if (rawDeletedCats) {
        const parsedDelCats = JSON.parse(rawDeletedCats);
        if (Array.isArray(parsedDelCats)) {
          deletedCategorySubsRef.current = new Set(parsedDelCats.map(String));
        }
      }

      let hydratedCats = DEFAULT_CATEGORY_CONFIGS;
      const rawCats = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
      if (rawCats !== null) {
        const parsedCats = JSON.parse(rawCats);
        if (Array.isArray(parsedCats) && parsedCats.length > 0) {
          const existingSubs = new Set(
            parsedCats.map((c: CategoryConfig) => c.sub_category)
          );
          const mergedCats = [...parsedCats];
          for (const defCfg of DEFAULT_CATEGORY_CONFIGS) {
            if (
              !existingSubs.has(defCfg.sub_category) &&
              !deletedCategorySubsRef.current.has(defCfg.sub_category)
            ) {
              mergedCats.push(defCfg);
            }
          }
          mergedCats.sort(
            (a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99)
          );
          hydratedCats = mergedCats;
          setCategoryConfigs(mergedCats);
          categoryConfigsRef.current = mergedCats;
        }
      }

      const rawSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      let hydratedSbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
      let hydratedSbKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
      if (rawSettings) {
        const parsedSettings = JSON.parse(rawSettings);
        hydratedSbUrl =
          parsedSettings.supabaseUrl?.trim() || hydratedSbUrl || '';
        hydratedSbKey =
          parsedSettings.supabaseAnonKey?.trim() || hydratedSbKey || '';
        setSettings((prev) => {
          const nextSettings = {
            ...prev,
            ...parsedSettings,
            supabaseUrl:
              parsedSettings.supabaseUrl?.trim() ||
              prev.supabaseUrl ||
              process.env.NEXT_PUBLIC_SUPABASE_URL ||
              '',
            supabaseAnonKey:
              parsedSettings.supabaseAnonKey?.trim() ||
              prev.supabaseAnonKey ||
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
              '',
            googleMapsApiKey:
              parsedSettings.googleMapsApiKey?.trim() ||
              prev.googleMapsApiKey ||
              process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
              '',
            geminiApiKey:
              parsedSettings.geminiApiKey?.trim() ||
              prev.geminiApiKey ||
              process.env.NEXT_PUBLIC_GEMINI_API_KEY ||
              '',
          };
          settingsRef.current = nextSettings;
          return nextSettings;
        });
      }

      const rawPlaces = localStorage.getItem(STORAGE_KEYS.PLACES);
      if (rawPlaces !== null) {
        const parsed = JSON.parse(rawPlaces);
        if (Array.isArray(parsed)) {
          let sanitized: SavedPlace[] = parsed.map(sanitizePlaceRecord);
          const hasSb =
            Boolean(normalizeSupabaseUrl(hydratedSbUrl)) &&
            Boolean(cleanApiKey(hydratedSbKey));
          // If Supabase is NOT configured, run one-time full category verification here;
          // If Supabase IS configured, syncWithSupabase runs it right after pulling remote so cloud gets updated too!
          if (
            !hasSb &&
            localStorage.getItem(STORAGE_KEYS.ALL_CATEGORIES_VERIFIED) !== '1'
          ) {
            const migIso = new Date().toISOString();
            const fixedDetails: string[] = [];
            sanitized = sanitized.map((p) => {
              const res = verifyPlaceCategorySingle(
                p,
                hydratedCats,
                deletedCategorySubsRef.current,
                migIso
              );
              if (res) {
                fixedDetails.push(
                  `${p.name}（${res.oldLabel} → ${res.newLabel}）`
                );
                return res.updated;
              }
              return p;
            });
            if (fixedDetails.length > 0) {
              setAuditProgress({
                current: sanitized.length,
                total: sanitized.length,
                fixedCount: fixedDetails.length,
                fixedDetails,
                done: true,
              });
            }
            localStorage.setItem(STORAGE_KEYS.STREET_FOOD_MIGRATED, '1');
            localStorage.setItem(STORAGE_KEYS.ALL_CATEGORIES_VERIFIED, '1');
          }
          setPlaces(sanitized);
          placesRef.current = sanitized;
        }
      }

      const storedLastSyncedAt = localStorage.getItem(
        STORAGE_KEYS.LAST_SYNCED_AT
      );
      if (storedLastSyncedAt) {
        setLastSyncedAt(storedLastSyncedAt);
      }

      // Check for sync_keys in URL (e.g. from scanning PC QR code)
      if (typeof window !== 'undefined') {
        try {
          const urlParams = new URLSearchParams(window.location.search);
          const syncKeysParam = urlParams.get('sync_keys');
          if (syncKeysParam) {
            let jsonStr = '';
            try {
              jsonStr = decodeURIComponent(atob(syncKeysParam));
            } catch {
              jsonStr = decodeURIComponent(syncKeysParam);
            }
            const synced = JSON.parse(jsonStr);
            if (synced && typeof synced === 'object') {
              setSettings((prev) => {
                const updated = {
                  ...prev,
                  ...(synced.googleMapsApiKey
                    ? { googleMapsApiKey: String(synced.googleMapsApiKey).trim() }
                    : {}),
                  ...(synced.geminiApiKey
                    ? { geminiApiKey: String(synced.geminiApiKey).trim() }
                    : {}),
                  ...(synced.supabaseUrl
                    ? { supabaseUrl: String(synced.supabaseUrl).trim() }
                    : {}),
                  ...(synced.supabaseAnonKey
                    ? { supabaseAnonKey: String(synced.supabaseAnonKey).trim() }
                    : {}),
                };
                settingsRef.current = updated;
                try {
                  localStorage.setItem(
                    STORAGE_KEYS.SETTINGS,
                    JSON.stringify(updated)
                  );
                } catch {}
                return updated;
              });
              setLastSyncMessage('🎉 已成功從電腦同步 API 金鑰至此裝置！');
              urlParams.delete('sync_keys');
              const newSearch = urlParams.toString();
              const newUrl =
                window.location.pathname +
                (newSearch ? `?${newSearch}` : '') +
                window.location.hash;
              window.history.replaceState({}, document.title, newUrl);
            }
          }
        } catch (err) {
          console.warn('Failed to parse sync_keys from URL:', err);
        }
      }
    } catch (e) {
      console.warn('Failed to hydrate state from localStorage:', e);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Persist places to localStorage
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.PLACES, JSON.stringify(places));
    } catch (e) {
      console.warn('Failed to save places to localStorage:', e);
    }
  }, [places, isHydrated]);

  // Persist categories to localStorage
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEYS.CATEGORIES,
        JSON.stringify(categoryConfigs)
      );
    } catch (e) {
      console.warn('Failed to save categories to localStorage:', e);
    }
  }, [categoryConfigs, isHydrated]);

  // Persist settings to localStorage
  useEffect(() => {
    if (!isHydrated) return;
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to save settings to localStorage:', e);
    }
  }, [settings, isHydrated]);

  /**
   * Smart Upsert:
   * - Matches existing place by google_place_id OR normalized name + city
   * - If existing: keeps user's visit_status & category, updates opening_hours_json & rating, appends new notes & tags
   * - If new: inserts at top of list
   */
  const smartUpsertPlaces = useCallback(
    (incoming: SavedPlace[]): UpsertActionRecord[] => {
      const nowIso = new Date().toISOString();
      const records: UpsertActionRecord[] = [];
      let deletedQueueChanged = false;

      setPlaces((prevPlaces) => {
        const nextList = [...prevPlaces];

        for (const rawItem of incoming) {
          const item = sanitizePlaceRecord(rawItem);
          const canonicalKey = toCanonicalGooglePlaceId(item);
          if (deletedPlaceIdsRef.current.has(canonicalKey)) {
            deletedPlaceIdsRef.current.delete(canonicalKey);
            deletedQueueChanged = true;
          }

          const normIncoming = normalizePlaceName(item.name);
          const existingIdx = nextList.findIndex(
            (p) =>
              (item.google_place_id &&
                p.google_place_id === item.google_place_id) ||
              (normalizePlaceName(p.name) === normIncoming &&
                (p.city === item.city || p.district === item.district))
          );

          if (existingIdx !== -1) {
            const existing = nextList[existingIdx];
            const incomingNote = (item.user_notes || '').trim();
            const existingNote = (existing.user_notes || '').trim();
            const shouldAppendNote =
              incomingNote &&
              incomingNote !== '透過智慧快速輸入新增' &&
              !existingNote.includes(incomingNote);

            const mergedNotesStr = shouldAppendNote
              ? existingNote
                ? `${existingNote} ｜ ${incomingNote}`
                : incomingNote
              : existingNote;

            const mergedTags = Array.from(
              new Set([
                ...(existing.custom_tags || []),
                ...(item.custom_tags || []),
              ])
            );

            const updatedPlace: SavedPlace = {
              ...existing,
              formatted_address:
                item.formatted_address || existing.formatted_address,
              rating: item.rating ?? existing.rating,
              opening_hours_json:
                item.opening_hours_json || existing.opening_hours_json,
              business_status:
                item.business_status || existing.business_status,
              user_notes: mergedNotesStr,
              custom_tags: mergedTags,
              hours_updated_at: nowIso,
              updated_at: nowIso,
            };

            // Move updated item to top so user sees it right away
            nextList.splice(existingIdx, 1);
            nextList.unshift(updatedPlace);

            records.push({
              place: updatedPlace,
              action: 'updated_existing',
              previousVisitStatus: existing.visit_status,
              mergedNotes: Boolean(shouldAppendNote),
            });
          } else {
            const newPlace: SavedPlace = {
              ...item,
              hours_updated_at: nowIso,
              created_at: item.created_at || nowIso,
              updated_at: nowIso,
            };
            nextList.unshift(newPlace);
            records.push({
              place: newPlace,
              action: 'created',
            });
          }
        }

        placesRef.current = nextList;
        return nextList;
      });

      if (deletedQueueChanged) {
        persistDeletedQueues();
      }
      setRecentUpserts(records);
      if (incoming.length > 0) {
        scheduleAutoPush();
      }
      return records;
    },
    [persistDeletedQueues, scheduleAutoPush]
  );

  const importPlacesFromJson = useCallback(
    (
      incoming: SavedPlace[],
      incomingCategories?: CategoryConfig[]
    ): number => {
      const validPlaces = incoming.filter(
        (p) => p && typeof p === 'object' && typeof p.name === 'string' && p.name.trim()
      );
      if (validPlaces.length === 0 && (!incomingCategories || incomingCategories.length === 0)) {
        return 0;
      }

      const nowIso = new Date().toISOString();

      if (validPlaces.length > 0) {
        let deletedQueueChanged = false;
        setPlaces((prevPlaces) => {
          const byKey = new Map<string, SavedPlace>();
          for (const p of prevPlaces) {
            byKey.set(toCanonicalGooglePlaceId(p), p);
          }

          for (const rawItem of validPlaces) {
            const sanitized = sanitizePlaceRecord({
              ...rawItem,
              id:
                rawItem.id ||
                `json-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              google_place_id:
                rawItem.google_place_id ||
                `json_${rawItem.name.replace(/\s+/g, '_').toLowerCase()}`,
              updated_at: nowIso,
              created_at: rawItem.created_at || nowIso,
              hours_updated_at: rawItem.hours_updated_at || nowIso,
            });
            const key = toCanonicalGooglePlaceId(sanitized);
            if (deletedPlaceIdsRef.current.has(key)) {
              deletedPlaceIdsRef.current.delete(key);
              deletedQueueChanged = true;
            }
            byKey.set(key, sanitized);
          }

          const merged = Array.from(byKey.values());
          placesRef.current = merged;
          return merged;
        });

        if (deletedQueueChanged) {
          persistDeletedQueues();
        }
      }

      if (Array.isArray(incomingCategories) && incomingCategories.length > 0) {
        setCategoryConfigs((prev) => {
          const bySub = new Map<string, CategoryConfig>();
          for (const c of prev) {
            bySub.set(c.sub_category, c);
          }
          for (const c of incomingCategories) {
            if (c && c.sub_category && c.sub_label) {
              deletedCategorySubsRef.current.delete(c.sub_category);
              bySub.set(c.sub_category, { ...c, updated_at: nowIso });
            }
          }
          const mergedCats = Array.from(bySub.values()).sort(
            (a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99)
          );
          categoryConfigsRef.current = mergedCats;
          return mergedCats;
        });
        persistDeletedQueues();
      }

      scheduleAutoPush();
      return validPlaces.length;
    },
    [persistDeletedQueues, scheduleAutoPush]
  );

  const updatePlaceInline = useCallback(
    (id: string, patch: Partial<SavedPlace>) => {
      const nowIso = new Date().toISOString();
      setPlaces((prev) => {
        const next = prev.map((p) => {
          if (p.id !== id) return p;
          // If sub_category changed and estimated_stay_mins wasn't explicitly patched, update default stay mins
          let nextStay = patch.estimated_stay_mins ?? p.estimated_stay_mins;
          if (
            patch.sub_category &&
            patch.sub_category !== p.sub_category &&
            patch.estimated_stay_mins === undefined
          ) {
            const matchedCat = categoryConfigs.find(
              (c) => c.sub_category === patch.sub_category
            );
            if (matchedCat) {
              nextStay = matchedCat.default_stay_mins;
            }
          }
          const nextLastVisited =
            patch.visit_status === 'visited_revisit' ||
            patch.visit_status === 'visited_skip'
              ? p.last_visited_at || nowIso.slice(0, 10)
              : p.last_visited_at;

          return {
            ...p,
            ...patch,
            estimated_stay_mins: nextStay,
            last_visited_at: nextLastVisited,
            updated_at: nowIso,
          };
        });
        placesRef.current = next;
        return next;
      });

      setRecentUpserts((prev) =>
        prev.map((rec) =>
          rec.place.id === id
            ? {
                ...rec,
                place: {
                  ...rec.place,
                  ...patch,
                  updated_at: nowIso,
                },
              }
            : rec
        )
      );
      scheduleAutoPush();
    },
    [categoryConfigs, scheduleAutoPush]
  );

  const deletePlace = useCallback(
    (id: string) => {
      const target = placesRef.current.find((p) => p.id === id);
      if (target) {
        deletedPlaceIdsRef.current.add(toCanonicalGooglePlaceId(target));
        persistDeletedQueues();
      }
      setPlaces((prev) => {
        const next = prev.filter((p) => p.id !== id);
        placesRef.current = next;
        return next;
      });
      setRecentUpserts((prev) => prev.filter((r) => r.place.id !== id));
      scheduleAutoPush();
    },
    [persistDeletedQueues, scheduleAutoPush]
  );

  const clearRecentUpserts = useCallback(() => {
    setRecentUpserts([]);
  }, []);

  const addCategoryConfig = useCallback(
    (config: Omit<CategoryConfig, 'id' | 'sort_order'>) => {
      const cleanSub = config.sub_category
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
      const id = `${config.primary_category}:${cleanSub}`;
      const nowIso = new Date().toISOString();
      if (deletedCategorySubsRef.current.has(cleanSub)) {
        deletedCategorySubsRef.current.delete(cleanSub);
        persistDeletedQueues();
      }
      setCategoryConfigs((prev) => {
        if (prev.some((c) => c.sub_category === cleanSub)) {
          return prev;
        }
        const next = [
          ...prev,
          {
            ...config,
            sub_category: cleanSub,
            id,
            sort_order: prev.length * 10 + 10,
            updated_at: nowIso,
          },
        ];
        categoryConfigsRef.current = next;
        return next;
      });
      scheduleAutoPush();
    },
    [persistDeletedQueues, scheduleAutoPush]
  );

  const updateCategoryConfig = useCallback(
    (id: string, patch: Partial<CategoryConfig>) => {
      const nowIso = new Date().toISOString();
      setCategoryConfigs((prev) => {
        const next = prev.map((c) =>
          c.id === id ? { ...c, ...patch, updated_at: nowIso } : c
        );
        categoryConfigsRef.current = next;
        return next;
      });
      scheduleAutoPush();
    },
    [scheduleAutoPush]
  );

  const deleteCategoryConfig = useCallback(
    (id: string) => {
      const target = categoryConfigsRef.current.find((c) => c.id === id);
      if (target) {
        deletedCategorySubsRef.current.add(target.sub_category);
        persistDeletedQueues();
      }
      setCategoryConfigs((prev) => {
        const next = prev.filter((c) => c.id !== id);
        categoryConfigsRef.current = next;
        return next;
      });
      scheduleAutoPush();
    },
    [persistDeletedQueues, scheduleAutoPush]
  );

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      settingsRef.current = next;
      return next;
    });
  }, []);

  const importSettingsCode = useCallback((codeOrUrl: string): boolean => {
    try {
      let raw = codeOrUrl.trim();
      if (raw.includes('sync_keys=')) {
        try {
          const u = new URL(raw, 'https://dummy.local');
          raw = u.searchParams.get('sync_keys') || raw;
        } catch {
          const m = raw.match(/sync_keys=([^&#\s]+)/);
          if (m) raw = m[1];
        }
      }
      let jsonStr = '';
      try {
        jsonStr = decodeURIComponent(atob(raw));
      } catch {
        jsonStr = decodeURIComponent(raw);
      }
      const synced = JSON.parse(jsonStr);
      if (synced && typeof synced === 'object') {
        setSettings((prev) => {
          const updated = {
            ...prev,
            ...(synced.googleMapsApiKey
              ? { googleMapsApiKey: String(synced.googleMapsApiKey).trim() }
              : {}),
            ...(synced.geminiApiKey
              ? { geminiApiKey: String(synced.geminiApiKey).trim() }
              : {}),
            ...(synced.supabaseUrl
              ? { supabaseUrl: String(synced.supabaseUrl).trim() }
              : {}),
            ...(synced.supabaseAnonKey
              ? { supabaseAnonKey: String(synced.supabaseAnonKey).trim() }
              : {}),
          };
          settingsRef.current = updated;
          try {
            localStorage.setItem(
              STORAGE_KEYS.SETTINGS,
              JSON.stringify(updated)
            );
          } catch {}
          return updated;
        });
        setLastSyncError(null);
        setLastSyncMessage('🎉 成功匯入金鑰設定！Google Maps、Gemini 與 Supabase 已就緒。');
        return true;
      }
    } catch (e) {
      console.warn('Failed to import settings code:', e);
    }
    return false;
  }, []);

  const refreshPlacesHours = useCallback(
    async (targetPlaces: SavedPlace[]): Promise<number> => {
      if (targetPlaces.length === 0) return 0;
      setIsSyncing(true);
      try {
        const res = await fetch('/api/refresh-hours', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            places: targetPlaces,
            googleMapsApiKey: settings.googleMapsApiKey,
          }),
        });
        if (!res.ok) return 0;
        const data = await res.json();
        const refreshedMap = new Map<string, SavedPlace>();
        for (const rp of data.places || []) {
          refreshedMap.set(rp.id, rp);
        }
        setPlaces((prev) => {
          const next = prev.map((p) => refreshedMap.get(p.id) || p);
          placesRef.current = next;
          return next;
        });
        setLastSyncMessage(
          `已更新 ${refreshedMap.size} 間店家的最新 Google 營業狀態與時間`
        );
        if (refreshedMap.size > 0) {
          scheduleAutoPush();
        }
        return refreshedMap.size;
      } catch (e) {
        console.warn('Refresh hours error:', e);
        return 0;
      } finally {
        setIsSyncing(false);
      }
    },
    [settings.googleMapsApiKey, scheduleAutoPush]
  );

  /**
   * Full Bidirectional Supabase Sync (Phone PWA ↔ PC):
   * 1. Push pending local deletions (saved_places & category_configs)
   * 2. Pull cloud saved_places & category_configs
   * 3. Merge by latest updated_at (and detect remote deletions via lastSyncedPlaceIds)
   * 4. On a fresh PWA's first sync, never push unmodified 33 default demo places back to cloud
   * 5. Batch upsert newly added or locally newer places & categories
   */
  const syncWithSupabase = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    const curSettings = settingsRef.current;
    const supabaseUrl = normalizeSupabaseUrl(curSettings.supabaseUrl);
    const supabaseAnonKey = cleanApiKey(curSettings.supabaseAnonKey);

    if (
      !supabaseUrl ||
      !supabaseAnonKey ||
      supabaseUrl.includes('your-project-id')
    ) {
      const msg = '請先填入有效的 Supabase URL 與 Anon Key';
      setLastSyncError(msg);
      setLastSyncMessage(msg);
      return { ok: false, message: msg };
    }

    // If the user's stored URL had extra paths/spaces/duplicates, auto-clean it in state
    if (
      supabaseUrl !== curSettings.supabaseUrl ||
      supabaseAnonKey !== curSettings.supabaseAnonKey
    ) {
      setSettings((prev) => {
        const cleaned = {
          ...prev,
          supabaseUrl,
          supabaseAnonKey,
        };
        settingsRef.current = cleaned;
        return cleaned;
      });
    }

    if (isSyncingRef.current) {
      return { ok: true, message: '雲端同步進行中，請稍候...' };
    }

    isSyncingRef.current = true;
    setIsSyncing(true);

    const formatSbErr = (
      step: string,
      err: { message?: string; code?: string; details?: string; hint?: string }
    ) => {
      const codePart = err.code ? `[${err.code}] ` : '';
      const hintPart = err.hint ? `（提示：${err.hint}）` : '';
      return `${step}：${codePart}${err.message || '未知錯誤'}${hintPart}（連線網址：${supabaseUrl}）`;
    };

    try {
      const supabase = createClient(supabaseUrl, supabaseAnonKey);

      // Step 1: Push pending deletions first
      const pendingDeletedPlaceIds = Array.from(deletedPlaceIdsRef.current);
      let pushedDeletedCount = 0;
      if (pendingDeletedPlaceIds.length > 0) {
        const DEL_BATCH = 50;
        for (let i = 0; i < pendingDeletedPlaceIds.length; i += DEL_BATCH) {
          const slice = pendingDeletedPlaceIds.slice(i, i + DEL_BATCH);
          const { error: delErr } = await supabase
            .from('saved_places')
            .delete()
            .in('google_place_id', slice);
          if (delErr) {
            throw new Error(formatSbErr('推送刪除景點失敗', delErr));
          }
          pushedDeletedCount += slice.length;
        }
        for (const id of pendingDeletedPlaceIds) {
          deletedPlaceIdsRef.current.delete(id);
        }
        persistDeletedQueues();
      }

      const pendingDeletedCatSubs = Array.from(deletedCategorySubsRef.current);
      if (pendingDeletedCatSubs.length > 0) {
        const { error: delCatErr } = await supabase
          .from('category_configs')
          .delete()
          .in('sub_category', pendingDeletedCatSubs);
        if (delCatErr) {
          throw new Error(formatSbErr('推送刪除分類失敗', delCatErr));
        }
        for (const sub of pendingDeletedCatSubs) {
          deletedCategorySubsRef.current.delete(sub);
        }
        persistDeletedQueues();
      }

      // Step 2: Pull cloud saved_places & category_configs
      const { data: remotePlaceRows, error: pullPlacesErr } = await supabase
        .from('saved_places')
        .select(
          'id, google_place_id, name, formatted_address, country, city, district, latitude, longitude, primary_category, sub_category, visit_status, business_status, estimated_stay_mins, rating, opening_hours_json, google_maps_url, user_notes, custom_tags, last_visited_at, hours_updated_at, created_at, updated_at'
        )
        .limit(5000);

      if (pullPlacesErr) {
        throw new Error(formatSbErr('拉取雲端景點失敗', pullPlacesErr));
      }

      const { data: remoteCatRows, error: pullCatsErr } = await supabase
        .from('category_configs')
        .select(
          'id, primary_category, primary_label, sub_category, sub_label, default_stay_mins, icon_name, sort_order, updated_at'
        )
        .order('sort_order', { ascending: true });

      if (pullCatsErr) {
        throw new Error(formatSbErr('拉取雲端分類失敗', pullCatsErr));
      }

      const remotePlaces: SavedPlace[] = (remotePlaceRows || []).map((row) =>
        supabaseRowToPlace(row as Record<string, unknown>)
      );
      const remoteCategories: CategoryConfig[] = (remoteCatRows || []).map(
        (row) => ({
          id: String(row.id),
          primary_category: String(row.primary_category),
          primary_label: String(row.primary_label),
          sub_category: String(row.sub_category),
          sub_label: String(row.sub_label),
          default_stay_mins: Number(row.default_stay_mins) || 60,
          icon_name: String(row.icon_name || 'MapPin'),
          sort_order: Number(row.sort_order) || 100,
          updated_at: row.updated_at ? String(row.updated_at) : undefined,
        })
      );

      // Read prior sync metadata
      let hasSyncedOnce = false;
      let lastSyncedAtMs = 0;
      let lastSyncedPlaceIds = new Set<string>();
      try {
        hasSyncedOnce =
          localStorage.getItem(STORAGE_KEYS.HAS_SYNCED_ONCE) === '1';
        lastSyncedAtMs = parseTimestampMs(
          localStorage.getItem(STORAGE_KEYS.LAST_SYNCED_AT)
        );
        const rawIds = localStorage.getItem(STORAGE_KEYS.LAST_SYNCED_PLACE_IDS);
        if (rawIds) {
          const parsedIds = JSON.parse(rawIds);
          if (Array.isArray(parsedIds)) {
            lastSyncedPlaceIds = new Set(parsedIds.map(String));
          }
        }
      } catch {}

      // Step 3: Merge saved_places by latest updated_at
      const localPlaces = placesRef.current;
      const remoteByKey = new Map<string, SavedPlace>();
      for (const rp of remotePlaces) {
        remoteByKey.set(toCanonicalGooglePlaceId(rp), rp);
      }

      const localByKey = new Map<string, SavedPlace>();
      for (const lp of localPlaces) {
        localByKey.set(toCanonicalGooglePlaceId(lp), lp);
      }

      const mergedPlacesMap = new Map<string, SavedPlace>();
      const placesToPushMap = new Map<string, SavedPlace>();
      let pulledCount = 0;
      let removedByRemoteDelete = 0;

      // 3a. Reconcile all remote places
      for (const [key, remote] of remoteByKey.entries()) {
        if (deletedPlaceIdsRef.current.has(key)) continue;
        const local = localByKey.get(key);
        if (!local) {
          mergedPlacesMap.set(key, remote);
          pulledCount += 1;
        } else if (!hasSyncedOnce && isUnmodifiedDefaultPlace(local)) {
          // On fresh PWA first sync, cloud always wins over fresh demo timestamps
          mergedPlacesMap.set(key, remote);
        } else {
          const localTs = parseTimestampMs(local.updated_at);
          const remoteTs = parseTimestampMs(remote.updated_at);
          if (localTs > remoteTs + 1000) {
            mergedPlacesMap.set(key, local);
            placesToPushMap.set(key, local);
          } else {
            mergedPlacesMap.set(key, remote);
            if (remoteTs > localTs + 1000) {
              pulledCount += 1;
            }
          }
        }
      }

      // 3b. Reconcile local-only places
      for (const [key, local] of localByKey.entries()) {
        if (remoteByKey.has(key)) continue;

        // Fresh PWA first sync: never push unmodified 33 default demo places back to cloud!
        if (!hasSyncedOnce && isUnmodifiedDefaultPlace(local)) {
          // If cloud is empty, keep demo places locally for usability without pushing;
          // If cloud already has data, adopt cloud dataset cleanly
          if (remotePlaces.length === 0) {
            mergedPlacesMap.set(key, local);
          }
          continue;
        }

        // If previously synced to cloud, now absent in cloud, and not modified locally since last sync -> deleted on another device
        const localTs = parseTimestampMs(local.updated_at);
        if (
          hasSyncedOnce &&
          lastSyncedPlaceIds.has(key) &&
          lastSyncedAtMs > 0 &&
          localTs <= lastSyncedAtMs + 1000
        ) {
          removedByRemoteDelete += 1;
          continue;
        }

        mergedPlacesMap.set(key, local);
        placesToPushMap.set(key, local);
      }

      // 3c. One-time comprehensive verification of ALL place categories across the entire list
      let allCatsVerifiedAlready = false;
      try {
        allCatsVerifiedAlready =
          localStorage.getItem(STORAGE_KEYS.ALL_CATEGORIES_VERIFIED) === '1';
      } catch {}
      if (!allCatsVerifiedAlready) {
        const migrationIso = new Date().toISOString();
        const fixedDetails: string[] = [];
        for (const [key, mp] of Array.from(mergedPlacesMap.entries())) {
          const res = verifyPlaceCategorySingle(
            mp,
            categoryConfigsRef.current,
            deletedCategorySubsRef.current,
            migrationIso
          );
          if (res) {
            mergedPlacesMap.set(key, res.updated);
            fixedDetails.push(
              `${mp.name}（${res.oldLabel} → ${res.newLabel}）`
            );
            if (
              !(
                !hasSyncedOnce &&
                remotePlaces.length === 0 &&
                isUnmodifiedDefaultPlace(mp)
              )
            ) {
              placesToPushMap.set(key, res.updated);
            }
          }
        }
        if (fixedDetails.length > 0) {
          setAuditProgress({
            current: mergedPlacesMap.size,
            total: mergedPlacesMap.size,
            fixedCount: fixedDetails.length,
            fixedDetails,
            done: true,
          });
        }
        try {
          localStorage.setItem(STORAGE_KEYS.STREET_FOOD_MIGRATED, '1');
          localStorage.setItem(STORAGE_KEYS.ALL_CATEGORIES_VERIFIED, '1');
        } catch {}
      }

      // Step 4: Batch upsert new/updated places to Supabase
      const placesToPush = Array.from(placesToPushMap.values());
      const UPSERT_BATCH = 50;
      for (let i = 0; i < placesToPush.length; i += UPSERT_BATCH) {
        const batchRows = placesToPush
          .slice(i, i + UPSERT_BATCH)
          .map(placeToSupabaseRow);
        const { error: upsertErr } = await supabase
          .from('saved_places')
          .upsert(batchRows, { onConflict: 'google_place_id' });
        if (upsertErr) {
          throw new Error(formatSbErr('批次寫入景點失敗', upsertErr));
        }
      }

      // Step 5: Merge & batch upsert category_configs
      const localCategories = categoryConfigsRef.current;
      const remoteCatBySub = new Map<string, CategoryConfig>();
      for (const rc of remoteCategories) {
        remoteCatBySub.set(rc.sub_category, rc);
      }
      const localCatBySub = new Map<string, CategoryConfig>();
      for (const lc of localCategories) {
        localCatBySub.set(lc.sub_category, lc);
      }
      for (const defCfg of DEFAULT_CATEGORY_CONFIGS) {
        if (
          !localCatBySub.has(defCfg.sub_category) &&
          !deletedCategorySubsRef.current.has(defCfg.sub_category)
        ) {
          localCatBySub.set(defCfg.sub_category, defCfg);
        }
      }

      const mergedCatsMap = new Map<string, CategoryConfig>();
      const catsToPush: CategoryConfig[] = [];

      for (const [sub, rc] of remoteCatBySub.entries()) {
        if (deletedCategorySubsRef.current.has(sub)) continue;
        const lc = localCatBySub.get(sub);
        if (!lc) {
          mergedCatsMap.set(sub, rc);
        } else if (!hasSyncedOnce && isUnmodifiedDefaultCategory(lc)) {
          mergedCatsMap.set(sub, rc);
        } else {
          const localTs = parseTimestampMs(lc.updated_at);
          const remoteTs = parseTimestampMs(rc.updated_at);
          if (localTs > remoteTs + 1000) {
            mergedCatsMap.set(sub, lc);
            catsToPush.push(lc);
          } else {
            mergedCatsMap.set(sub, rc);
          }
        }
      }

      for (const [sub, lc] of localCatBySub.entries()) {
        if (remoteCatBySub.has(sub)) continue;
        if (deletedCategorySubsRef.current.has(sub)) continue;
        mergedCatsMap.set(sub, lc);
        if (
          sub === 'street_food' ||
          !(!hasSyncedOnce && remoteCategories.length > 0 && isUnmodifiedDefaultCategory(lc))
        ) {
          catsToPush.push(lc);
        }
      }

      if (catsToPush.length > 0) {
        const nowIso = new Date().toISOString();
        const catRows = catsToPush.map((c) => ({
          id: c.id,
          primary_category: c.primary_category,
          primary_label: c.primary_label,
          sub_category: c.sub_category,
          sub_label: c.sub_label,
          default_stay_mins: Math.max(5, Math.round(Number(c.default_stay_mins) || 60)),
          icon_name: c.icon_name || 'MapPin',
          sort_order: Number(c.sort_order) || 100,
          updated_at: c.updated_at || nowIso,
        }));
        const { error: upsertCatErr } = await supabase
          .from('category_configs')
          .upsert(catRows, { onConflict: 'sub_category' });
        if (upsertCatErr) {
          throw new Error(formatSbErr('同步分類設定失敗', upsertCatErr));
        }
      }

      const mergedPlaces = Array.from(mergedPlacesMap.values()).sort(
        (a, b) =>
          parseTimestampMs(b.updated_at) - parseTimestampMs(a.updated_at)
      );
      const mergedCategories = Array.from(mergedCatsMap.values()).sort(
        (a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99)
      );

      placesRef.current = mergedPlaces;
      setPlaces(mergedPlaces);
      if (mergedCategories.length > 0) {
        categoryConfigsRef.current = mergedCategories;
        setCategoryConfigs(mergedCategories);
      }

      const syncedNowIso = new Date().toISOString();
      lastSyncCompletedAtRef.current = Date.now();
      setLastSyncedAt(syncedNowIso);
      setLastSyncError(null);

      // Persist sync metadata
      // Only mark HAS_SYNCED_ONCE when cloud actually has data or local pushed real places,
      // so a fresh PWA syncing against an empty cloud won't push unmodified demo places later.
      const cloudSyncedKeys = new Set<string>([
        ...Array.from(remoteByKey.keys()),
        ...placesToPush.map(toCanonicalGooglePlaceId),
      ]);
      try {
        if (remotePlaces.length > 0 || placesToPush.length > 0) {
          localStorage.setItem(STORAGE_KEYS.HAS_SYNCED_ONCE, '1');
        }
        localStorage.setItem(STORAGE_KEYS.LAST_SYNCED_AT, syncedNowIso);
        localStorage.setItem(
          STORAGE_KEYS.LAST_SYNCED_PLACE_IDS,
          JSON.stringify(Array.from(cloudSyncedKeys))
        );
      } catch {}

      const summaryParts: string[] = [];
      if (placesToPush.length > 0) summaryParts.push(`上傳 ${placesToPush.length} 筆`);
      if (pulledCount > 0) summaryParts.push(`拉回 ${pulledCount} 筆`);
      if (pushedDeletedCount > 0) summaryParts.push(`刪除 ${pushedDeletedCount} 筆`);
      if (removedByRemoteDelete > 0) {
        summaryParts.push(`同步移除 ${removedByRemoteDelete} 筆`);
      }

      const detail =
        summaryParts.length > 0 ? summaryParts.join('、') : '已是最新狀態';
      const msg = `✅ 雙向同步完成（${detail}，共 ${mergedPlaces.length} 筆景點）`;
      setLastSyncMessage(msg);
      return { ok: true, message: msg };
    } catch (err) {
      const rawErr =
        err instanceof Error ? err.message : '無法連線至 Supabase 雲端資料庫';
      const msg = `⚠️ Supabase 雙向同步失敗：${rawErr}`;
      console.error('Supabase bidirectional sync failed:', err);
      setLastSyncError(msg);
      setLastSyncMessage(msg);
      return { ok: false, message: msg };
    } finally {
      isSyncingRef.current = false;
      setIsSyncing(false);
    }
  }, [persistDeletedQueues]);

  useEffect(() => {
    syncWithSupabaseRef.current = syncWithSupabase;
  }, [syncWithSupabase]);

  // Auto-sync on page load when Supabase is configured
  useEffect(() => {
    if (!isHydrated || !isSupabaseConfigured || initialSyncTriggeredRef.current) {
      return;
    }
    initialSyncTriggeredRef.current = true;
    void syncWithSupabase();
  }, [isHydrated, isSupabaseConfigured, syncWithSupabase]);

  // Auto-sync when PWA returns to foreground (throttled to 15 seconds)
  useEffect(() => {
    if (!isHydrated || !isSupabaseConfigured) return;

    const triggerForegroundSync = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        return;
      }
      if (isSyncingRef.current) return;
      const elapsedMs = Date.now() - lastSyncCompletedAtRef.current;
      if (elapsedMs < 15_000) return;
      void syncWithSupabase();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        triggerForegroundSync();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', triggerForegroundSync);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', triggerForegroundSync);
    };
  }, [isHydrated, isSupabaseConfigured, syncWithSupabase]);

  const resetToDemoData = useCallback(() => {
    setPlaces(INITIAL_SAVED_PLACES);
    placesRef.current = INITIAL_SAVED_PLACES;
    setCategoryConfigs(DEFAULT_CATEGORY_CONFIGS);
    categoryConfigsRef.current = DEFAULT_CATEGORY_CONFIGS;
    setRecentUpserts([]);
    deletedPlaceIdsRef.current.clear();
    deletedCategorySubsRef.current.clear();
    persistDeletedQueues();
    try {
      localStorage.setItem(
        STORAGE_KEYS.PLACES,
        JSON.stringify(INITIAL_SAVED_PLACES)
      );
      localStorage.setItem(
        STORAGE_KEYS.CATEGORIES,
        JSON.stringify(DEFAULT_CATEGORY_CONFIGS)
      );
    } catch {}
  }, [persistDeletedQueues]);

  const auditAndFixAllPlaces = useCallback(
    async (
      targetCity?: string
    ): Promise<{ totalChecked: number; fixedCount: number }> => {
      const targets =
        targetCity && targetCity !== 'ALL'
          ? places.filter((p) => p.city === targetCity)
          : places;

      if (targets.length === 0) {
        return { totalChecked: 0, fixedCount: 0 };
      }

      setIsAuditingPlaces(true);
      let fixedCount = 0;
      const fixedDetails: string[] = [];
      setAuditProgress({
        current: 0,
        total: targets.length,
        fixedCount: 0,
        fixedDetails: [],
        done: false,
      });

      const CHUNK_SIZE = 5;
      try {
        for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
          const chunk = targets.slice(i, i + CHUNK_SIZE);
          try {
            const res = await fetch('/api/smart-parse', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                batch: chunk.map((p) => ({
                  url: p.google_maps_url || '',
                  title: p.name,
                  note: '',
                  googlePlaceId: p.google_place_id || '',
                  rowCoords:
                    p.latitude && p.longitude
                      ? { lat: p.latitude, lng: p.longitude }
                      : null,
                })),
                defaultCity: chunk[0]?.city || '台南市',
                categoryConfigs,
                geminiApiKey: settings.geminiApiKey,
                googleMapsApiKey: settings.googleMapsApiKey,
              }),
            });

            if (res.ok) {
              const data = await res.json();
              const enrichedList: SavedPlace[] = Array.isArray(data.places)
                ? data.places
                : [];

              const updatesById = new Map<string, SavedPlace>();

              chunk.forEach((orig, idx) => {
                const enriched = enrichedList[idx];
                if (!enriched) return;

                const nextName = cleanStoreName(enriched.name || orig.name) || orig.name;
                const nextCity = enriched.city || orig.city;
                const nextDist = enriched.district || orig.district;
                const hasRealEnrichedAddr = /[路街段巷弄號大道]/.test(
                  enriched.formatted_address || ''
                );
                const nextAddr = hasRealEnrichedAddr
                  ? enriched.formatted_address
                  : orig.formatted_address || enriched.formatted_address;

                const isDefaultHours = (
                  h?: SavedPlace['opening_hours_json']
                ) =>
                  !h?.weekday_descriptions?.length ||
                  (h.weekday_descriptions.length === 1 &&
                    h.weekday_descriptions[0] === '每日 10:00–21:00');

                // Never downgrade a specific non-meal category (landmark/museum/bar/trail/etc.) back to generic 'meal'!
                const inferredFromName = inferPlaceCategoryByName(nextName);
                let nextPrimary = orig.primary_category;
                let nextSub = orig.sub_category;
                let nextStay = orig.estimated_stay_mins;

                if (enriched.sub_category && enriched.sub_category !== 'meal') {
                  nextPrimary = enriched.primary_category || orig.primary_category;
                  nextSub = enriched.sub_category;
                  nextStay = enriched.estimated_stay_mins || orig.estimated_stay_mins;
                } else if (
                  orig.sub_category === 'meal' &&
                  inferredFromName.sub_category !== 'meal'
                ) {
                  nextPrimary = inferredFromName.primary_category;
                  nextSub = inferredFromName.sub_category;
                  const cfg = categoryConfigs.find(
                    (c) => c.sub_category === inferredFromName.sub_category
                  );
                  nextStay =
                    cfg?.default_stay_mins ?? inferredFromName.estimated_stay_mins;
                } else if (
                  orig.sub_category === 'meal' &&
                  (orig.user_notes || '').includes('參觀者表示')
                ) {
                  nextPrimary = 'museum_culture';
                  nextSub = 'museum';
                  nextStay = 110;
                } else if (
                  orig.sub_category === 'meal' &&
                  (orig.user_notes || '').includes('遊客表示')
                ) {
                  nextPrimary = 'museum_culture';
                  nextSub = 'landmark';
                  nextStay = 60;
                }

                // Never overwrite real opening hours (e.g. 星期一: 休息, 24 小時營業) with fallback '每日 10:00–21:00'
                const nextHours =
                  !isDefaultHours(enriched.opening_hours_json) ||
                  isDefaultHours(orig.opening_hours_json)
                    ? enriched.opening_hours_json || orig.opening_hours_json
                    : orig.opening_hours_json;

                // Determine if original note should be replaced (English, empty, generic, mismatched category, or cross-district)
                const origNote = (orig.user_notes || '').trim();
                const enrichedNote = (enriched.user_notes || '').trim();
                const isEnglishNote =
                  origNote.length > 10 && !/[\u4e00-\u9fff]/.test(origNote);
                const isEnrichedBadFallback =
                  !enrichedNote ||
                  (enrichedNote.length > 10 &&
                    !/[\u4e00-\u9fff]/.test(enrichedNote)) ||
                  enrichedNote.includes(
                    '顧客表示這家餐廳的餐點美味又份量充足，特別是招牌主食'
                  ) ||
                  (nextPrimary !== 'restaurant' &&
                    enrichedNote.includes('這家餐廳的餐點美味'));

                const isGenericOrBadNote =
                  !origNote ||
                  isEnglishNote ||
                  origNote.includes('Google Maps 在地高評價推薦熱點') ||
                  origNote.includes('深獲旅人與老饕喜愛') ||
                  origNote.includes('由 CSV 清單匯入') ||
                  origNote.includes('由 Google Takeout 匯入') ||
                  origNote.includes('透過智慧快速輸入新增') ||
                  origNote.includes('以特色調酒與創意下酒料理聞名') ||
                  origNote.includes('以特色原創調酒與精緻下酒料理聞名') ||
                  origNote.includes('在地人氣餐酒酒吧') ||
                  origNote.includes('人氣餐酒酒吧') ||
                  origNote.includes('參觀者表示這座文化展館的展覽內容豐富且策展用心') ||
                  origNote.includes('顧客表示這家餐廳的餐點美味又份量充足，特別是招牌主食') ||
                  (nextPrimary !== 'restaurant' &&
                    origNote.includes('這家餐廳的餐點美味')) ||
                  (nextDist !== '中西區' && origNote.includes('國華街')) ||
                  (nextDist !== '中西區' && origNote.includes('保安路'));

                const nextNotes = isGenericOrBadNote
                  ? !isEnrichedBadFallback
                    ? enrichedNote
                    : resolvePlaceDescription(
                        nextName,
                        nextCity,
                        nextDist,
                        nextSub,
                        nextAddr
                      )
                  : origNote;

                const changes: string[] = [];
                if (nextCity !== orig.city || nextDist !== orig.district) {
                  changes.push(
                    `地區 ${orig.city}・${orig.district} → ${nextCity}・${nextDist}`
                  );
                }
                if (nextSub !== orig.sub_category) {
                  const oldLabel =
                    categoryConfigs.find((c) => c.sub_category === orig.sub_category)
                      ?.sub_label || orig.sub_category;
                  const newLabel =
                    categoryConfigs.find((c) => c.sub_category === nextSub)
                      ?.sub_label || nextSub;
                  changes.push(`分類 ${oldLabel} → ${newLabel}`);
                }
                if (nextName !== orig.name) {
                  changes.push(`店名修正`);
                }
                if (nextNotes !== origNote) {
                  changes.push(`備註更新`);
                }

                if (changes.length > 0 || nextAddr !== orig.formatted_address) {
                  if (changes.length > 0) {
                    fixedCount += 1;
                    fixedDetails.push(`${nextName}（${changes.join('、')}）`);
                  }
                  updatesById.set(orig.id, {
                    ...orig,
                    name: nextName,
                    google_place_id:
                      enriched.google_place_id || orig.google_place_id,
                    formatted_address: nextAddr,
                    country: enriched.country || orig.country,
                    city: nextCity,
                    district: nextDist,
                    latitude: enriched.latitude || orig.latitude,
                    longitude: enriched.longitude || orig.longitude,
                    primary_category: nextPrimary,
                    sub_category: nextSub,
                    estimated_stay_mins: nextStay,
                    rating: enriched.rating ?? orig.rating,
                    business_status:
                      enriched.business_status || orig.business_status,
                    opening_hours_json: nextHours,
                    user_notes: nextNotes,
                    updated_at: new Date().toISOString(),
                  });
                }
              });

              if (updatesById.size > 0) {
                setPlaces((prev) => {
                  const next = prev.map((p) => updatesById.get(p.id) || p);
                  placesRef.current = next;
                  return next;
                });
                setRecentUpserts((prev) =>
                  prev.map((rec) => {
                    const updated = updatesById.get(rec.place.id);
                    return updated ? { ...rec, place: updated } : rec;
                  })
                );
                scheduleAutoPush();
              }
            }
          } catch (chunkErr) {
            console.warn('Audit chunk error:', chunkErr);
          }

          setAuditProgress({
            current: Math.min(i + chunk.length, targets.length),
            total: targets.length,
            fixedCount,
            fixedDetails: [...fixedDetails],
            done: false,
          });
        }

        try {
          localStorage.setItem('antigravity_places_audit_v5', new Date().toISOString());
        } catch {}

        setAuditProgress({
          current: targets.length,
          total: targets.length,
          fixedCount,
          fixedDetails,
          done: true,
        });
        return { totalChecked: targets.length, fixedCount };
      } finally {
        setIsAuditingPlaces(false);
      }
    },
    [
      places,
      categoryConfigs,
      settings.geminiApiKey,
      settings.googleMapsApiKey,
      scheduleAutoPush,
    ]
  );

  const reclassifyStreetFoodFromMeals = useCallback((): number => {
    const nowIso = new Date().toISOString();
    const defaultStreetCfg = DEFAULT_CATEGORY_CONFIGS.find(
      (c) => c.sub_category === 'street_food'
    );
    let activeStreetStay = 40;
    const existingStreetCfg = categoryConfigsRef.current.find(
      (c) => c.sub_category === 'street_food'
    );
    if (existingStreetCfg) {
      activeStreetStay = existingStreetCfg.default_stay_mins || 40;
    } else if (defaultStreetCfg) {
      deletedCategorySubsRef.current.delete('street_food');
      persistDeletedQueues();
      const nextCats = [
        ...categoryConfigsRef.current,
        { ...defaultStreetCfg, updated_at: nowIso },
      ].sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99));
      categoryConfigsRef.current = nextCats;
      setCategoryConfigs(nextCats);
    }

    let count = 0;
    const nextPlaces = placesRef.current.map((p) => {
      if (
        p.primary_category === 'restaurant' &&
        p.sub_category === 'meal' &&
        isTaiwaneseStreetFood(p.name, '', p.custom_tags)
      ) {
        count += 1;
        return {
          ...p,
          sub_category: 'street_food',
          estimated_stay_mins: activeStreetStay,
          updated_at: nowIso,
        };
      }
      return p;
    });

    try {
      localStorage.setItem(STORAGE_KEYS.STREET_FOOD_MIGRATED, '1');
    } catch {}

    if (count > 0) {
      placesRef.current = nextPlaces;
      setPlaces(nextPlaces);
      scheduleAutoPush();
    }
    return count;
  }, [persistDeletedQueues, scheduleAutoPush]);

  const verifyAllPlacesCategories = useCallback(
    (
      targetCity?: string
    ): { totalChecked: number; fixedCount: number; fixedDetails: string[] } => {
      const nowIso = new Date().toISOString();
      // Ensure all non-deleted default categories exist in categoryConfigs
      const existingSubs = new Set(
        categoryConfigsRef.current.map((c) => c.sub_category)
      );
      const missingDefaults = DEFAULT_CATEGORY_CONFIGS.filter(
        (def) =>
          !existingSubs.has(def.sub_category) &&
          !deletedCategorySubsRef.current.has(def.sub_category)
      );
      let activeCats = categoryConfigsRef.current;
      if (missingDefaults.length > 0) {
        activeCats = [
          ...categoryConfigsRef.current,
          ...missingDefaults.map((d) => ({ ...d, updated_at: nowIso })),
        ].sort((a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99));
        categoryConfigsRef.current = activeCats;
        setCategoryConfigs(activeCats);
      }

      let totalChecked = 0;
      const fixedDetails: string[] = [];
      const nextPlaces = placesRef.current.map((p) => {
        if (targetCity && targetCity !== 'ALL' && p.city !== targetCity) {
          return p;
        }
        totalChecked += 1;
        const res = verifyPlaceCategorySingle(
          p,
          activeCats,
          deletedCategorySubsRef.current,
          nowIso
        );
        if (res) {
          fixedDetails.push(`${p.name}（${res.oldLabel} → ${res.newLabel}）`);
          return res.updated;
        }
        return p;
      });

      try {
        localStorage.setItem(STORAGE_KEYS.STREET_FOOD_MIGRATED, '1');
        localStorage.setItem(STORAGE_KEYS.ALL_CATEGORIES_VERIFIED, '1');
      } catch {}

      if (fixedDetails.length > 0 || missingDefaults.length > 0) {
        placesRef.current = nextPlaces;
        setPlaces(nextPlaces);
        scheduleAutoPush();
      }

      setAuditProgress({
        current: totalChecked,
        total: totalChecked,
        fixedCount: fixedDetails.length,
        fixedDetails,
        done: true,
      });

      return {
        totalChecked,
        fixedCount: fixedDetails.length,
        fixedDetails,
      };
    },
    [scheduleAutoPush]
  );

  const value = useMemo(
    () => ({
      places,
      categoryConfigs,
      settings,
      recentUpserts,
      isHydrated,
      isSyncing,
      isSupabaseConfigured,
      lastSyncMessage,
      lastSyncError,
      lastSyncedAt,
      clearSyncFeedback,
      isAuditingPlaces,
      auditProgress,
      clearAuditProgress,
      auditAndFixAllPlaces,
      smartUpsertPlaces,
      importPlacesFromJson,
      updatePlaceInline,
      deletePlace,
      clearRecentUpserts,
      addCategoryConfig,
      updateCategoryConfig,
      deleteCategoryConfig,
      updateSettings,
      importSettingsCode,
      refreshPlacesHours,
      reclassifyStreetFoodFromMeals,
      verifyAllPlacesCategories,
      syncWithSupabase,
      resetToDemoData,
    }),
    [
      places,
      categoryConfigs,
      settings,
      recentUpserts,
      isHydrated,
      isSyncing,
      isSupabaseConfigured,
      lastSyncMessage,
      lastSyncError,
      lastSyncedAt,
      clearSyncFeedback,
      isAuditingPlaces,
      auditProgress,
      clearAuditProgress,
      auditAndFixAllPlaces,
      smartUpsertPlaces,
      importPlacesFromJson,
      updatePlaceInline,
      deletePlace,
      clearRecentUpserts,
      addCategoryConfig,
      updateCategoryConfig,
      deleteCategoryConfig,
      updateSettings,
      importSettingsCode,
      refreshPlacesHours,
      reclassifyStreetFoodFromMeals,
      verifyAllPlacesCategories,
      syncWithSupabase,
      resetToDemoData,
    ]
  );

  return (
    <PlacesContext.Provider value={value}>{children}</PlacesContext.Provider>
  );
}

export function usePlaces() {
  const ctx = useContext(PlacesContext);
  if (!ctx) {
    throw new Error('usePlaces must be used within a PlacesProvider');
  }
  return ctx;
}
