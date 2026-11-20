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
  cleanStoreName,
  extractCoordsFromGoogleMapsUrl,
  extractRegionFromAddress,
  getCoordinatesForRegion,
  inferPlaceCategoryByName,
  separateNameAndAddress,
} from '@/lib/geo-utils';
import { resolvePlaceDescription } from '@/lib/place-notes';

const STORAGE_KEYS = {
  PLACES: 'antigravity_travel_places_v1',
  CATEGORIES: 'antigravity_travel_categories_v1',
  SETTINGS: 'antigravity_travel_settings_v1',
};

const DEFAULT_SETTINGS: AppSettings = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  geminiApiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY || '',
  autoRefreshHoursOnPlan: true,
  defaultTravelMode: 'WALK',
  defaultRadiusMeters: 5000,
};

interface PlacesContextValue {
  places: SavedPlace[];
  categoryConfigs: CategoryConfig[];
  settings: AppSettings;
  recentUpserts: UpsertActionRecord[];
  isHydrated: boolean;
  isSyncing: boolean;
  lastSyncMessage: string | null;
  smartUpsertPlaces: (incoming: SavedPlace[]) => UpsertActionRecord[];
  updatePlaceInline: (id: string, patch: Partial<SavedPlace>) => void;
  deletePlace: (id: string) => void;
  clearRecentUpserts: () => void;
  addCategoryConfig: (config: Omit<CategoryConfig, 'id' | 'sort_order'>) => void;
  updateCategoryConfig: (id: string, patch: Partial<CategoryConfig>) => void;
  deleteCategoryConfig: (id: string) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  importSettingsCode: (codeOrUrl: string) => boolean;
  refreshPlacesHours: (targetPlaces: SavedPlace[]) => Promise<number>;
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

  // B. If a culture/landmark/bar place was defaulted to 'restaurant / meal':
  if (nextPrimary === 'restaurant' && nextSub === 'meal') {
    const inferredCat = inferPlaceCategoryByName(nextName);
    if (inferredCat.sub_category !== 'meal') {
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
  const enrichedIdsRef = React.useRef<Set<string>>(new Set());
  const isEnrichingRef = React.useRef<boolean>(false);

  // Hydrate from localStorage on client mount
  useEffect(() => {
    try {
      const rawPlaces = localStorage.getItem(STORAGE_KEYS.PLACES);
      if (rawPlaces !== null) {
        const parsed = JSON.parse(rawPlaces);
        if (Array.isArray(parsed)) {
          const sanitized = parsed.map(sanitizePlaceRecord);
          setPlaces(sanitized);
          // Also sync repaired records back to recentUpserts if any
        }
      }
      const rawCats = localStorage.getItem(STORAGE_KEYS.CATEGORIES);
      if (rawCats !== null) {
        const parsedCats = JSON.parse(rawCats);
        if (Array.isArray(parsedCats) && parsedCats.length > 0) {
          const existingSubs = new Set(
            parsedCats.map((c: CategoryConfig) => c.sub_category)
          );
          const mergedCats = [...parsedCats];
          for (const defCfg of DEFAULT_CATEGORY_CONFIGS) {
            if (!existingSubs.has(defCfg.sub_category)) {
              mergedCats.push(defCfg);
            }
          }
          mergedCats.sort(
            (a, b) => (a.sort_order ?? 99) - (b.sort_order ?? 99)
          );
          setCategoryConfigs(mergedCats);
        }
      }
      const rawSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (rawSettings) {
        const parsedSettings = JSON.parse(rawSettings);
        setSettings((prev) => ({
          ...prev,
          ...parsedSettings,
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
        }));
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

  // Automatically enrich CSV/Takeout imported places in the background
  // strictly preserving URL coordinates, city, and district without drift
  useEffect(() => {
    if (!isHydrated || isEnrichingRef.current) return;
    const hasMapsKey =
      Boolean(settings.googleMapsApiKey) &&
      settings.googleMapsApiKey !== 'your-google-maps-api-key';
    const hasGeminiKey =
      Boolean(settings.geminiApiKey) &&
      settings.geminiApiKey !== 'your-gemini-api-key';

    if (!hasMapsKey && !hasGeminiKey) {
      return;
    }

    const unenriched = places.filter((p) => {
      if (enrichedIdsRef.current.has(p.id)) return false;
      const isCsvOrTakeout =
        p.id?.startsWith('csv-') ||
        p.id?.startsWith('takeout-') ||
        p.google_place_id?.startsWith('csv_') ||
        p.google_place_id?.startsWith('takeout_') ||
        p.custom_tags?.includes('#CSV匯入') ||
        p.custom_tags?.includes('#Takeout匯入');
      if (!isCsvOrTakeout) return false;
      // Needs enrichment if formatted_address has no street/number OR note is a generic template
      const needsAddress = !/[路街段巷弄號大道]/.test(p.formatted_address || '');
      const needsNote =
        !p.user_notes ||
        p.user_notes.includes('參觀者表示這座文化展館的展覽內容豐富且策展用心') ||
        p.user_notes.includes('顧客表示這家餐廳的餐點美味又份量充足，特別是招牌主食') ||
        p.user_notes.includes('顧客表示這家酒吧提供美味又獨特的調酒與豐富飲品');
      return needsAddress || needsNote;
    });

    if (unenriched.length === 0) return;

    isEnrichingRef.current = true;
    (async () => {
      try {
        for (const item of unenriched) {
          if (enrichedIdsRef.current.has(item.id)) continue;
          enrichedIdsRef.current.add(item.id);
          try {
            let fetchedNote = '';

            // 1. Fetch official Google Maps Review Summary / Grounded Gemini Summary via /api/enrich-notes
            try {
              const noteRes = await fetch('/api/enrich-notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  name: item.name,
                  city: item.city,
                  district: item.district,
                  subCategory: item.sub_category,
                  address: item.formatted_address,
                  latitude: item.latitude,
                  longitude: item.longitude,
                  geminiApiKey: settings.geminiApiKey,
                  googleMapsApiKey: settings.googleMapsApiKey,
                }),
              });
              if (noteRes.ok) {
                const noteData = await noteRes.json();
                if (noteData.description) {
                  fetchedNote = noteData.description;
                }
              }
            } catch {
              // ignore individual note lookup error
            }

            // 2. If Google Maps API key is present and address is missing street details, enrich via /api/smart-parse
            let enriched: SavedPlace | undefined;
            if (hasMapsKey && !/[路街段巷弄號大道]/.test(item.formatted_address || '')) {
              const queryInput =
                item.google_maps_url &&
                !item.google_maps_url.includes('maps/search/?api=1&query=')
                  ? `${item.name} ${item.google_maps_url}`
                  : item.name;
              const res = await fetch('/api/smart-parse', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  input: queryInput,
                  defaultCity: item.city || '',
                  skipGemini: true,
                  categoryConfigs,
                  geminiApiKey: settings.geminiApiKey,
                  googleMapsApiKey: settings.googleMapsApiKey,
                }),
              });
              if (res.ok) {
                const data = await res.json();
                enriched = data.places?.[0];
              }
            }

            if (enriched || fetchedNote) {
              const applyEnriched = (p: SavedPlace): SavedPlace => {
                const hasValidCoords =
                  Boolean(p.latitude && p.longitude && p.latitude !== 0);
                const isSameDistrict =
                  !p.district || !enriched?.district || enriched.district === p.district;
                const nextAddr =
                  isSameDistrict && enriched?.formatted_address
                    ? enriched.formatted_address
                    : p.formatted_address;

                return {
                  ...p,
                  google_place_id:
                    enriched?.google_place_id || p.google_place_id,
                  formatted_address: nextAddr,
                  country: hasValidCoords
                    ? p.country
                    : enriched?.country || p.country,
                  city: hasValidCoords ? p.city : enriched?.city || p.city,
                  district: hasValidCoords
                    ? p.district
                    : enriched?.district || p.district,
                  latitude: hasValidCoords
                    ? p.latitude
                    : enriched?.latitude || p.latitude,
                  longitude: hasValidCoords
                    ? p.longitude
                    : enriched?.longitude || p.longitude,
                  primary_category: p.primary_category,
                  sub_category: p.sub_category,
                  estimated_stay_mins: p.estimated_stay_mins,
                  rating: enriched?.rating ?? p.rating,
                  opening_hours_json:
                    enriched?.opening_hours_json || p.opening_hours_json,
                  user_notes:
                    fetchedNote ||
                    (enriched?.user_notes &&
                    enriched.user_notes !== '由 CSV 清單匯入' &&
                    enriched.user_notes !== '由 Google Takeout 匯入' &&
                    enriched.user_notes !== '透過智慧快速輸入新增'
                      ? enriched.user_notes
                      : p.user_notes ||
                        resolvePlaceDescription(
                          p.name,
                          p.city,
                          p.district,
                          p.sub_category,
                          p.formatted_address
                        )),
                };
              };
              setPlaces((prev) =>
                prev.map((p) => (p.id === item.id ? applyEnriched(p) : p))
              );
              setRecentUpserts((prev) =>
                prev.map((rec) =>
                  rec.place.id === item.id
                    ? { ...rec, place: applyEnriched(rec.place) }
                    : rec
                )
              );
            }
          } catch {
            // ignore individual lookup errors
          }
        }
      } finally {
        isEnrichingRef.current = false;
      }
    })();
  }, [
    isHydrated,
    places,
    categoryConfigs,
    settings.geminiApiKey,
    settings.googleMapsApiKey,
  ]);

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

      setPlaces((prevPlaces) => {
        const nextList = [...prevPlaces];

        for (const rawItem of incoming) {
          const item = sanitizePlaceRecord(rawItem);
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
              created_at: nowIso,
              updated_at: nowIso,
            };
            nextList.unshift(newPlace);
            records.push({
              place: newPlace,
              action: 'created',
            });
          }
        }

        return nextList;
      });

      setRecentUpserts(records);
      return records;
    },
    []
  );

  const updatePlaceInline = useCallback(
    (id: string, patch: Partial<SavedPlace>) => {
      const nowIso = new Date().toISOString();
      setPlaces((prev) =>
        prev.map((p) => {
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
        })
      );

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
    },
    [categoryConfigs]
  );

  const deletePlace = useCallback((id: string) => {
    setPlaces((prev) => prev.filter((p) => p.id !== id));
    setRecentUpserts((prev) => prev.filter((r) => r.place.id !== id));
  }, []);

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
      setCategoryConfigs((prev) => {
        if (prev.some((c) => c.sub_category === cleanSub)) {
          return prev;
        }
        return [
          ...prev,
          {
            ...config,
            sub_category: cleanSub,
            id,
            sort_order: prev.length * 10 + 10,
          },
        ];
      });
    },
    []
  );

  const updateCategoryConfig = useCallback(
    (id: string, patch: Partial<CategoryConfig>) => {
      setCategoryConfigs((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...patch } : c))
      );
    },
    []
  );

  const deleteCategoryConfig = useCallback((id: string) => {
    setCategoryConfigs((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
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
          try {
            localStorage.setItem(
              STORAGE_KEYS.SETTINGS,
              JSON.stringify(updated)
            );
          } catch {}
          return updated;
        });
        setLastSyncMessage('🎉 成功匯入金鑰設定！Google Maps 與 Gemini 已就緒。');
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
        setPlaces((prev) =>
          prev.map((p) => refreshedMap.get(p.id) || p)
        );
        setLastSyncMessage(
          `已更新 ${refreshedMap.size} 間店家的最新 Google 營業狀態與時間`
        );
        return refreshedMap.size;
      } catch (e) {
        console.warn('Refresh hours error:', e);
        return 0;
      } finally {
        setIsSyncing(false);
      }
    },
    [settings.googleMapsApiKey]
  );

  const syncWithSupabase = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    if (
      !settings.supabaseUrl ||
      !settings.supabaseAnonKey ||
      settings.supabaseUrl.includes('your-project-id')
    ) {
      return {
        ok: false,
        message: '請先填入有效的 Supabase URL 與 Anon Key',
      };
    }

    setIsSyncing(true);
    try {
      const supabase = createClient(
        settings.supabaseUrl,
        settings.supabaseAnonKey
      );
      for (const p of places) {
        await supabase.rpc('upsert_saved_place', {
          p_google_place_id: p.google_place_id,
          p_name: p.name,
          p_formatted_address: p.formatted_address,
          p_country: p.country,
          p_city: p.city,
          p_district: p.district,
          p_lat: p.latitude,
          p_lng: p.longitude,
          p_primary_category: p.primary_category,
          p_sub_category: p.sub_category,
          p_visit_status: p.visit_status,
          p_estimated_stay_mins: p.estimated_stay_mins,
          p_rating: p.rating,
          p_opening_hours_json: p.opening_hours_json,
          p_google_maps_url: p.google_maps_url,
          p_user_notes: p.user_notes,
          p_custom_tags: p.custom_tags,
        });
      }
      const msg = `成功將 ${places.length} 筆景點同步至 Supabase PostGIS 雲端資料庫！`;
      setLastSyncMessage(msg);
      return { ok: true, message: msg };
    } catch (err) {
      const msg =
        err instanceof Error
          ? `Supabase 同步失敗: ${err.message}`
          : 'Supabase 連線失敗，資料已安全保存於瀏覽器本機';
      setLastSyncMessage(msg);
      return { ok: false, message: msg };
    } finally {
      setIsSyncing(false);
    }
  }, [places, settings.supabaseAnonKey, settings.supabaseUrl]);

  const resetToDemoData = useCallback(() => {
    setPlaces(INITIAL_SAVED_PLACES);
    setCategoryConfigs(DEFAULT_CATEGORY_CONFIGS);
    setRecentUpserts([]);
    localStorage.setItem(
      STORAGE_KEYS.PLACES,
      JSON.stringify(INITIAL_SAVED_PLACES)
    );
    localStorage.setItem(
      STORAGE_KEYS.CATEGORIES,
      JSON.stringify(DEFAULT_CATEGORY_CONFIGS)
    );
  }, []);

  const value = useMemo(
    () => ({
      places,
      categoryConfigs,
      settings,
      recentUpserts,
      isHydrated,
      isSyncing,
      lastSyncMessage,
      smartUpsertPlaces,
      updatePlaceInline,
      deletePlace,
      clearRecentUpserts,
      addCategoryConfig,
      updateCategoryConfig,
      deleteCategoryConfig,
      updateSettings,
      importSettingsCode,
      refreshPlacesHours,
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
      lastSyncMessage,
      smartUpsertPlaces,
      updatePlaceInline,
      deletePlace,
      clearRecentUpserts,
      addCategoryConfig,
      updateCategoryConfig,
      deleteCategoryConfig,
      updateSettings,
      importSettingsCode,
      refreshPlacesHours,
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
