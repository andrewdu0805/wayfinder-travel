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
import { ALL_AVAILABLE_CITIES } from '@/lib/default-data';
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
      {/* 頂部：新增地點大輸入框 */}
      <SmartQuickAddBar activeCity={selectedCity} />

      {/* 獨立分類篩選面板（大字體、一目了然） */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-5">
        {/* 第一排：城市／地區選擇 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-base font-extrabold text-stone-700 mr-1">
              <Globe2 className="h-5 w-5 text-teal-700" />
              📍 地區：
            </span>
            <button
              type="button"
              onClick={() => setSelectedCity('ALL')}
              className={`rounded-xl px-4 py-2 text-base font-extrabold transition-all cursor-pointer ${
                selectedCity === 'ALL'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              全部 ({places.length})
            </button>
            {cityGroups.map((grp) => (
              <button
                key={grp.city}
                type="button"
                onClick={() => setSelectedCity(grp.city)}
                className={`rounded-xl px-4 py-2 text-base font-extrabold transition-all cursor-pointer ${
                  selectedCity === grp.city
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {grp.city} ({grp.count})
              </button>
            ))}

            {/* 若當前選擇的城市不在現有卡片群中（新切換的城市），顯示該城市的專屬標籤 */}
            {selectedCity !== 'ALL' &&
              !cityGroups.some((g) => g.city === selectedCity) && (
                <button
                  type="button"
                  onClick={() => setSelectedCity(selectedCity)}
                  className="rounded-xl px-4 py-2 text-base font-extrabold bg-stone-900 text-white shadow-xs cursor-pointer"
                >
                  📍 {selectedCity} (0)
                </button>
              )}

            {/* 一鍵切換全台其他縣市與海外旅遊城市 */}
            <select
              aria-label="選擇其他縣市或地區"
              value={selectedCity !== 'ALL' ? selectedCity : ''}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedCity(e.target.value);
                }
              }}
              className="rounded-xl border-2 border-dashed border-teal-300 bg-teal-50/70 px-3 py-2 text-sm sm:text-base font-extrabold text-teal-900 hover:bg-teal-100/70 focus:outline-none cursor-pointer"
            >
              <option value="">＋ 切換／加入其他縣市...</option>
              <optgroup label="台灣北部">
                <option value="台北市">台北市</option>
                <option value="新北市">新北市</option>
                <option value="基隆市">基隆市</option>
                <option value="桃園市">桃園市</option>
                <option value="新竹市">新竹市</option>
                <option value="新竹縣">新竹縣</option>
                <option value="宜蘭縣">宜蘭縣</option>
              </optgroup>
              <optgroup label="台灣中部">
                <option value="台中市">台中市</option>
                <option value="苗栗縣">苗栗縣</option>
                <option value="彰化縣">彰化縣</option>
                <option value="南投縣">南投縣</option>
                <option value="雲林縣">雲林縣</option>
              </optgroup>
              <optgroup label="台灣南部">
                <option value="台南市">台南市</option>
                <option value="高雄市">高雄市</option>
                <option value="嘉義市">嘉義市</option>
                <option value="嘉義縣">嘉義縣</option>
                <option value="屏東縣">屏東縣</option>
              </optgroup>
              <optgroup label="台灣東部與離島">
                <option value="花蓮縣">花蓮縣</option>
                <option value="台東縣">台東縣</option>
                <option value="澎湖縣">澎湖縣</option>
                <option value="金門縣">金門縣</option>
              </optgroup>
              <optgroup label="日本與海外">
                <option value="東京都">東京都</option>
                <option value="京都府">京都府</option>
                <option value="大阪府">大阪府</option>
                <option value="北海道">北海道</option>
                <option value="福岡縣">福岡縣</option>
                <option value="沖繩縣">沖繩縣</option>
              </optgroup>
            </select>
          </div>

          <button
            id="btn-open-category-settings"
            type="button"
            onClick={onOpenSettingsModal}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-50 px-4 py-2 text-sm sm:text-base font-bold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <FolderCog className="h-4 w-4 text-amber-700" />
            ＋ 自訂分類
          </button>
        </div>

        {/* 第二排：地點類型分類（正餐、點心、伴手禮、展館...） */}
        <div className="flex flex-wrap items-center gap-2 pb-4 border-b border-stone-100">
          <span className="inline-flex items-center gap-1.5 text-base font-extrabold text-stone-700 mr-1">
            <Filter className="h-5 w-5 text-amber-700" />
            🏷️ 分類：
          </span>
          <button
            type="button"
            onClick={() => setSelectedSubCategory('ALL')}
            className={`rounded-xl px-4 py-2 text-base font-extrabold transition-all cursor-pointer ${
              selectedSubCategory === 'ALL'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
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
            if (count === 0 && selectedSubCategory !== cfg.sub_category) return null;
            return (
              <button
                key={cfg.id}
                type="button"
                onClick={() => setSelectedSubCategory(cfg.sub_category)}
                className={`rounded-xl px-4 py-2 text-base font-extrabold transition-all cursor-pointer ${
                  selectedSubCategory === cfg.sub_category
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {cfg.sub_label} ({count})
              </button>
            );
          })}
        </div>

        {/* 第三排：造訪狀態 ＋ 關鍵字搜尋 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { key: 'ALL', label: '全部狀態' },
                { key: 'unvisited', label: '🌟 想去（沒去過）' },
                { key: 'visited_revisit', label: '❤️ 想再去' },
                { key: 'visited_skip', label: '🚫 不推薦' },
              ] as Array<{ key: 'ALL' | VisitStatus; label: string }>
            ).map((st) => (
              <button
                key={st.key}
                type="button"
                onClick={() => setSelectedVisitStatus(st.key)}
                className={`rounded-xl px-4 py-2 text-base font-extrabold transition-all cursor-pointer ${
                  selectedVisitStatus === st.key
                    ? 'bg-teal-700 text-white shadow-xs'
                    : 'border border-stone-300 bg-stone-50 text-stone-700 hover:bg-stone-100'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-80">
            <Search className="h-5 w-5 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="搜尋店名、區域或備註..."
              className="w-full rounded-xl border-2 border-stone-300 bg-stone-50 pl-10 pr-4 py-2 text-base font-medium text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* 地點卡片清單（大字雙欄排版，手機單欄、平板電腦雙欄） */}
      {filteredPlaces.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-stone-300 bg-white p-10 sm:p-14 text-center space-y-3">
          <p className="text-xl font-extrabold text-stone-800">
            {selectedCity !== 'ALL'
              ? `目前「${selectedCity}」還沒有收藏地點`
              : '沒有符合目前篩選條件的地點'}
          </p>
          <p className="text-base font-medium text-stone-600 max-w-md mx-auto">
            {selectedCity !== 'ALL'
              ? `💡 只要在最上方輸入店名或貼上 Google Maps 網址，系統就會自動將新景點收錄至「${selectedCity}」！`
              : '請切換上方「地區／分類」按鈕，或在最上方新增店家'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredPlaces.map((place) => (
            <PlaceCard key={place.id} place={place} />
          ))}
        </div>
      )}
    </div>
  );
}
