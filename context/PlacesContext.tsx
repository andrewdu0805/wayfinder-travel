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

const STORAGE_KEYS = {
  PLACES: 'antigravity_travel_places_v1',
  CATEGORIES: 'antigravity_travel_categories_v1',
  SETTINGS: 'antigravity_travel_settings_v1',
};

const DEFAULT_SETTINGS: AppSettings = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  googleMapsApiKey: '',
  geminiApiKey: '',
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

  // Hydrate from localStorage on client mount
  useEffect(() => {
    try {
      const rawPlaces = localStorage.getItem(STORAGE_KEYS.PLACES);
      if (rawPlaces !== null) {
        const parsed = JSON.parse(rawPlaces);
        if (Array.isArray(parsed)) {
          setPlaces(parsed);
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
        setSettings((prev) => ({ ...prev, ...parsedSettings }));
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

      setPlaces((prevPlaces) => {
        const nextList = [...prevPlaces];

        for (const item of incoming) {
          const normIncoming = normalizePlaceName(item.name);
          const existingIdx = nextList.findIndex(
            (p) =>
              (item.google_place_id &&
                p.google_place_id === item.google_place_id) ||
              (normalizePlaceName(p.name) === normIncoming &&
                p.city === item.city)
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
