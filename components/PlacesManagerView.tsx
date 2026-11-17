'use client';

import React, { useMemo, useState } from 'react';
import {
  Filter,
  FolderCog,
  Globe2,
  RefreshCw,
  Search,
} from 'lucide-react';
import { usePlaces } from '@/context/PlacesContext';
import { VisitStatus } from '@/types/place';
import { SmartQuickAddBar } from './SmartQuickAddBar';
import { PlaceCard } from './PlaceCard';

interface PlacesManagerViewProps {
  onOpenSettingsModal: () => void;
}

export function PlacesManagerView({
  onOpenSettingsModal,
}: PlacesManagerViewProps) {
  const {
    places,
    categoryConfigs,
    isSyncing,
    lastSyncMessage,
    refreshPlacesHours,
  } = usePlaces();

  const [selectedCity, setSelectedCity] = useState<string>('ALL');
  const [selectedSubCategory, setSelectedSubCategory] =
    useState<string>('ALL');
  const [selectedVisitStatus, setSelectedVisitStatus] = useState<
    'ALL' | VisitStatus
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Automatically aggregate cities & counts from saved places
  const cityGroups = useMemo(() => {
    const map = new Map<
      string,
      { city: string; country: string; count: number }
    >();
    for (const p of places) {
      const key = p.city || '未分類城市';
      const cur = map.get(key);
      if (cur) {
        cur.count += 1;
      } else {
        map.set(key, {
          city: key,
          country: p.country || '台灣',
          count: 1,
        });
      }
    }
    return Array.from(map.values());
  }, [places]);

  // Filter places by region, category, visit_status, and search keyword
  const filteredPlaces = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return places.filter((p) => {
      if (selectedCity !== 'ALL' && p.city !== selectedCity) return false;
      if (
        selectedSubCategory !== 'ALL' &&
        p.sub_category !== selectedSubCategory
      ) {
        return false;
      }
      if (
        selectedVisitStatus !== 'ALL' &&
        p.visit_status !== selectedVisitStatus
      ) {
        return false;
      }
      if (q) {
        const hay = `${p.name} ${p.formatted_address} ${p.district} ${
          p.user_notes || ''
        } ${(p.custom_tags || []).join(' ')}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    places,
    selectedCity,
    selectedSubCategory,
    selectedVisitStatus,
    searchQuery,
  ]);

  const handleBatchRefreshRegionHours = async () => {
    await refreshPlacesHours(filteredPlaces);
  };

  return (
    <div className="space-y-5">
      {/* Top Smart Quick-Add Bar ("秒存＋行內秒改") */}
      <SmartQuickAddBar activeCity={selectedCity} />

      {/* Region & Multi-Dimensional Filter Panel */}
      <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 shadow-2xs space-y-4">
        {/* Row 1: City / Region Capsules + Batch Refresh Opening Hours Button */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-stone-100">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-stone-500 mr-1">
              <Globe2 className="h-3.5 w-3.5 text-teal-700" />
              地區歸檔：
            </span>
            <button
              type="button"
              onClick={() => setSelectedCity('ALL')}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                selectedCity === 'ALL'
                  ? 'bg-stone-900 text-white shadow-2xs'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200/70'
              }`}
            >
              全部地區 ({places.length})
            </button>
            {cityGroups.map((grp) => (
              <button
                key={grp.city}
                type="button"
                onClick={() => setSelectedCity(grp.city)}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  selectedCity === grp.city
                    ? 'bg-stone-900 text-white shadow-2xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200/70'
                }`}
              >
                {grp.country}・{grp.city} ({grp.count})
              </button>
            ))}
          </div>

          {/* 1-Click Refresh Region Opening Hours */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              id="btn-batch-refresh-hours"
              type="button"
              disabled={isSyncing || filteredPlaces.length === 0}
              onClick={handleBatchRefreshRegionHours}
              className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200 bg-teal-50/70 px-3 py-1.5 text-xs font-semibold text-teal-900 hover:bg-teal-100 disabled:opacity-50 transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-teal-700 ${
                  isSyncing ? 'animate-spin' : ''
                }`}
              />
              一鍵更新本區營業資訊 ({filteredPlaces.length} 間)
            </button>

            <button
              id="btn-open-category-settings"
              type="button"
              onClick={onOpenSettingsModal}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <FolderCog className="h-3.5 w-3.5 text-amber-700" />
              ＋ 新增／管理自訂分類
            </button>
          </div>
        </div>

        {lastSyncMessage && (
          <div className="rounded-lg bg-teal-50 border border-teal-200 px-3 py-1.5 text-xs font-medium text-teal-900">
            ✓ {lastSyncMessage}
          </div>
        )}

        {/* Row 2: Sub-Category Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs font-bold text-stone-500 mr-1">
            <Filter className="h-3.5 w-3.5 text-amber-700" />
            分類篩選：
          </span>
          <button
            type="button"
            onClick={() => setSelectedSubCategory('ALL')}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
              selectedSubCategory === 'ALL'
                ? 'bg-amber-600 text-white'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200/70'
            }`}
          >
            全部分類
          </button>
          {categoryConfigs.map((cfg) => {
            const count = places.filter(
              (p) =>
                (selectedCity === 'ALL' || p.city === selectedCity) &&
                p.sub_category === cfg.sub_category
            ).length;
            return (
              <button
                key={cfg.id}
                type="button"
                onClick={() => setSelectedSubCategory(cfg.sub_category)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                  selectedSubCategory === cfg.sub_category
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200/70'
                }`}
              >
                {cfg.sub_label} ({count})
              </button>
            );
          })}
        </div>

        {/* Row 3: Visit Status Filter + Keyword Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="inline-flex flex-wrap items-center gap-1.5">
            {(
              [
                { key: 'ALL', label: '全部造訪狀態' },
                { key: 'unvisited', label: '🌟 沒去過（優先探索）' },
                { key: 'visited_revisit', label: '❤️ 去過想再去' },
                { key: 'visited_skip', label: '🚫 去過不推' },
              ] as Array<{ key: 'ALL' | VisitStatus; label: string }>
            ).map((st) => (
              <button
                key={st.key}
                type="button"
                onClick={() => setSelectedVisitStatus(st.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  selectedVisitStatus === st.key
                    ? 'bg-stone-900 text-white'
                    : 'border border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-100'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="h-4 w-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋店名、行政區、筆記或 #標籤..."
              className="w-full rounded-xl border border-stone-300 bg-stone-50 pl-9 pr-3 py-1.5 text-xs text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* Places Cards Grid */}
      {filteredPlaces.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-stone-700">
            沒有符合目前篩選條件的收藏景點
          </p>
          <p className="text-xs text-stone-500">
            您可以切換上方地區／分類標籤，或直接在最上方「全能智慧解析秒存列」貼上新店家！
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPlaces.map((place) => (
            <PlaceCard key={place.id} place={place} />
          ))}
        </div>
      )}
    </div>
  );
}
