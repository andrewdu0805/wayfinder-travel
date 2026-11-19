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
  let nextName = p.name;
  let nextAddr = p.formatted_address || '';
  let nextCity = p.city;
  let nextDist = p.district;
  let nextLat = p.latitude;
  let nextLng = p.longitude;
  let nextPrimary = p.primary_category;
  let nextSub = p.sub_category;
  let nextStay = p.estimated_stay_mins;

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
    nextName = sep.cleanName;
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
    isPlaceholderAddr ? '' : nextAddr,
    nextName,
    p.name,
    p.user_notes || '',
    decodedUrlText,
  ]
    .filter(Boolean)
    .join(' ');

  const coordsForDetection =
    urlCoords || (!isPlaceholderAddr ? { lat: nextLat, lng: nextLng } : null);

  const reg = extractRegionFromAddress(
    addressTextForDetection,
    coordsForDetection,
    isPlaceholderAddr ? '台南市' : nextCity || '台南市'
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
    const inferredCat = inferPlaceCategoryByName(
      `${nextName} ${p.user_notes || ''}`
    );
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

  // 4.5. Auto-correct places erroneously classified as "restaurant / meal" when their name clearly indicates culture, landmark, park, etc.
  // Note: If user has explicitly changed the category to something else, this is skipped!
  if (nextPrimary === 'restaurant' && nextSub === 'meal') {
    const inferredCat = inferPlaceCategoryByName(
      `${nextName} ${p.user_notes || ''}`
    );
    if (inferredCat.sub_category !== 'meal') {
      nextPrimary = inferredCat.primary_category;
      nextSub = inferredCat.sub_category;
      nextStay = inferredCat.estimated_stay_mins;
    }
  }

  // 5. Google Maps-style Note & Description Auto-Resolution:
  // If notes are empty or generic import placeholders like "由 CSV 清單匯入", automatically resolve a rich Google Maps description!
  // ALSO: Self-heal cross-district notes mismatch (e.g. 新化區 store previously erroneously assigned 國華街 note)
  let nextNotes = p.user_notes || '';
  const hasCrossDistrictConflict =
    (nextDist !== '中西區' && nextNotes.includes('國華街')) ||
    (nextDist !== '中西區' && nextNotes.includes('保安路')) ||
    (nextDist !== '南區' && nextNotes.includes('夏林路')) ||
    (nextDist !== '北區' && nextNotes.includes('崇安街')) ||
    (nextDist !== '安平區' && nextNotes.includes('安平'));

  if (
    !nextNotes ||
    nextNotes === '由 CSV 清單匯入' ||
    nextNotes === '由 Google Takeout 匯入' ||
    nextNotes === '透過智慧快速輸入新增' ||
    hasCrossDistrictConflict
  ) {
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
          setCategoryConfigs(parsedCats);
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

  // Automatically enrich CSV/Takeout imported places in the background via /api/smart-parse
  // so they get exact official addresses, cities, districts, and coordinates
  useEffect(() => {
    if (!isHydrated || isEnrichingRef.current) return;
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
      // Needs enrichment if formatted_address has no street/number (號/路/街)
      return !/[路街段巷弄號大道]/.test(p.formatted_address || '');
    });

    if (unenriched.length === 0) return;

    isEnrichingRef.current = true;
    (async () => {
      try {
        for (const item of unenriched) {
          if (enrichedIdsRef.current.has(item.id)) continue;
          enrichedIdsRef.current.add(item.id);
          try {
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
                defaultCity: '',
                skipGemini: true,
                categoryConfigs,
                geminiApiKey: settings.geminiApiKey,
                googleMapsApiKey: settings.googleMapsApiKey,
              }),
            });
            if (!res.ok) continue;
            const data = await res.json();
            const enriched: SavedPlace | undefined = data.places?.[0];
            if (enriched) {
              const applyEnriched = (p: SavedPlace): SavedPlace => ({
                ...p,
                google_place_id: enriched.google_place_id || p.google_place_id,
                formatted_address:
                  enriched.formatted_address || p.formatted_address,
                country: enriched.country || p.country,
                city: enriched.city || p.city,
                district: enriched.district || p.district,
                latitude: enriched.latitude || p.latitude,
                longitude: enriched.longitude || p.longitude,
                // CRITICAL: NEVER let background address/coordinate enrichment overwrite the user's category!
                primary_category: p.primary_category,
                sub_category: p.sub_category,
                estimated_stay_mins: p.estimated_stay_mins,
                rating: enriched.rating ?? p.rating,
                opening_hours_json:
                  enriched.opening_hours_json || p.opening_hours_json,
                user_notes:
                  enriched.user_notes &&
                  enriched.user_notes !== '由 CSV 清單匯入' &&
                  enriched.user_notes !== '由 Google Takeout 匯入' &&
                  enriched.user_notes !== '透過智慧快速輸入新增'
                    ? enriched.user_notes
                    : p.user_notes ||
                      resolvePlaceDescription(
                        enriched.name || p.name,
                        enriched.city || p.city,
                        enriched.district || p.district,
                        p.sub_category,
                        enriched.formatted_address || p.formatted_address
                      ),
              });
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
