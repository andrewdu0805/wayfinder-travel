'use client';

import React, { useMemo, useState } from 'react';
import {
  FolderCog,
  RotateCcw,
  Search,
  X,
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
  } = usePlaces();

  const [selectedCity, setSelectedCity] = useState<string>('ALL');
  const [selectedSubCategory, setSelectedSubCategory] =
    useState<string>('ALL');
  const [selectedVisitStatus, setSelectedVisitStatus] = useState<
    'ALL' | VisitStatus
  >('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Places belonging to the currently selected city (or all)
  const placesInSelectedCity = useMemo(() => {
    return selectedCity === 'ALL'
      ? places
      : places.filter((p) => p.city === selectedCity);
  }, [places, selectedCity]);

  // Handle city selection with automatic sub-filter reset
  const handleSelectCity = (newCity: string) => {
    setSelectedCity(newCity);
    setSelectedSubCategory('ALL');
    setSelectedVisitStatus('ALL');
    setSearchQuery('');
  };

  // Automatically aggregate cities & counts from saved places (sorted by count desc)
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
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
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

  const hasActiveFilter =
    selectedCity !== 'ALL' ||
    selectedSubCategory !== 'ALL' ||
    selectedVisitStatus !== 'ALL' ||
    Boolean(searchQuery.trim());

  return (
    <div className="space-y-3.5">
      {/* 頂部：極簡快速新增列 */}
      <SmartQuickAddBar activeCity={selectedCity} />

      {/* 極簡緊湊篩選面板（不隨城市與分類增加而變長，永遠維持固定高度） */}
      <section className="rounded-2xl border border-stone-200 bg-white p-3 sm:p-4 shadow-xs space-y-2.5">
        {/* 第一排：📍 地區下拉選單 ＋ 🏷️ 分類下拉選單 ＋ ⚙️ 自訂分類 */}
        <div className="grid grid-cols-12 gap-2 items-center">
          {/* 📍 地區下拉選單（整合已收藏城市與全台/海外切換） */}
          <div className="col-span-5 sm:col-span-5">
            <select
              aria-label="選擇地區"
              value={selectedCity}
              onChange={(e) => handleSelectCity(e.target.value)}
              className={`w-full rounded-xl border-2 px-2.5 sm:px-3.5 py-2 text-sm sm:text-base font-extrabold focus:outline-none cursor-pointer transition-colors truncate ${
                selectedCity !== 'ALL'
                  ? 'border-stone-900 bg-stone-900 text-white'
                  : 'border-stone-300 bg-stone-50 text-stone-800 hover:bg-stone-100'
              }`}
            >
              <option value="ALL" className="bg-white text-stone-900 font-bold">
                📍 全部地區 ({places.length})
              </option>

              {cityGroups.length > 0 && (
                <optgroup
                  label="⭐ 已收藏地區"
                  className="bg-white text-stone-900 font-bold"
                >
                  {cityGroups.map((grp) => (
                    <option
                      key={grp.city}
                      value={grp.city}
                      className="bg-white text-stone-900 font-bold"
                    >
                      📍 {grp.city} ({grp.count})
                    </option>
                  ))}
                </optgroup>
              )}

              {/* 若目前選中的新城市為 0 筆，確保顯示於選單中 */}
              {selectedCity !== 'ALL' &&
                !cityGroups.some((g) => g.city === selectedCity) && (
                  <option
                    value={selectedCity}
                    className="bg-white text-stone-900 font-bold"
                  >
                    📍 {selectedCity} (0)
                  </option>
                )}

              <optgroup
                label="➕ 切換其他台灣北部縣市"
                className="bg-white text-stone-900"
              >
                <option value="台北市">台北市</option>
                <option value="新北市">新北市</option>
                <option value="基隆市">基隆市</option>
                <option value="桃園市">桃園市</option>
                <option value="新竹市">新竹市</option>
                <option value="新竹縣">新竹縣</option>
                <option value="宜蘭縣">宜蘭縣</option>
              </optgroup>
              <optgroup
                label="➕ 切換其他台灣中部縣市"
                className="bg-white text-stone-900"
              >
                <option value="台中市">台中市</option>
                <option value="苗栗縣">苗栗縣</option>
                <option value="彰化縣">彰化縣</option>
                <option value="南投縣">南投縣</option>
                <option value="雲林縣">雲林縣</option>
              </optgroup>
              <optgroup
                label="➕ 切換其他台灣南部縣市"
                className="bg-white text-stone-900"
              >
                <option value="台南市">台南市</option>
                <option value="高雄市">高雄市</option>
                <option value="嘉義市">嘉義市</option>
                <option value="嘉義縣">嘉義縣</option>
                <option value="屏東縣">屏東縣</option>
              </optgroup>
              <optgroup
                label="➕ 切換東部與離島"
                className="bg-white text-stone-900"
              >
                <option value="花蓮縣">花蓮縣</option>
                <option value="台東縣">台東縣</option>
                <option value="澎湖縣">澎湖縣</option>
                <option value="金門縣">金門縣</option>
              </optgroup>
              <optgroup
                label="➕ 切換日本與海外"
                className="bg-white text-stone-900"
              >
                <option value="東京都">東京都</option>
                <option value="京都府">京都府</option>
                <option value="大阪府">大阪府</option>
                <option value="北海道">北海道</option>
                <option value="福岡縣">福岡縣</option>
                <option value="沖繩縣">沖繩縣</option>
              </optgroup>
            </select>
          </div>

          {/* 🏷️ 分類下拉選單（正餐、點心、伴手禮、博物館... 不佔多行） */}
          <div className="col-span-5 sm:col-span-5">
            <select
              aria-label="選擇地點分類"
              value={selectedSubCategory}
              onChange={(e) => {
                if (e.target.value === '__OPEN_SETTINGS__') {
                  onOpenSettingsModal();
                  return;
                }
                setSelectedSubCategory(e.target.value);
              }}
              className={`w-full rounded-xl border-2 px-2.5 sm:px-3.5 py-2 text-sm sm:text-base font-extrabold focus:outline-none cursor-pointer transition-colors truncate ${
                selectedSubCategory !== 'ALL'
                  ? 'border-amber-600 bg-amber-600 text-white'
                  : 'border-stone-300 bg-stone-50 text-stone-800 hover:bg-stone-100'
              }`}
            >
              <option value="ALL" className="bg-white text-stone-900 font-bold">
                🏷️ 全部分類 ({placesInSelectedCity.length})
              </option>
              {categoryConfigs.map((cfg) => {
                const count = placesInSelectedCity.filter(
                  (p) => p.sub_category === cfg.sub_category
                ).length;
                return (
                  <option
                    key={cfg.id}
                    value={cfg.sub_category}
                    className="bg-white text-stone-900 font-bold"
                  >
                    🏷️ {cfg.sub_label} ({count})
                  </option>
                );
              })}
              <option
                value="__OPEN_SETTINGS__"
                className="bg-amber-50 text-amber-900 font-bold"
              >
                ➕ 新增／管理自訂分類...
              </option>
            </select>
          </div>

          {/* ⚙️ 自訂分類快捷鈕 */}
          <div className="col-span-2 sm:col-span-2 flex justify-end">
            <button
              id="btn-open-category-settings"
              type="button"
              onClick={onOpenSettingsModal}
              title="新增或管理自訂分類"
              className="w-full inline-flex items-center justify-center gap-1 rounded-xl border-2 border-stone-300 bg-stone-50 px-2 py-2 text-xs sm:text-sm font-extrabold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              <FolderCog className="h-4 w-4 text-amber-700 shrink-0" />
              <span className="hidden sm:inline">自訂</span>
            </button>
          </div>
        </div>

        {/* 第二排：4 格緊湊狀態切換 ＋ 關鍵字即時搜尋 */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                { key: 'ALL', label: '全部' },
                { key: 'unvisited', label: '🌟想去' },
                { key: 'visited_revisit', label: '❤️再訪' },
                { key: 'visited_skip', label: '🚫不推' },
              ] as Array<{ key: 'ALL' | VisitStatus; label: string }>
            ).map((st) => {
              const count =
                st.key === 'ALL'
                  ? placesInSelectedCity.length
                  : placesInSelectedCity.filter(
                      (p) => p.visit_status === st.key
                    ).length;
              return (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setSelectedVisitStatus(st.key)}
                  className={`rounded-xl px-1.5 sm:px-3 py-1.5 text-xs sm:text-sm font-extrabold transition-all cursor-pointer text-center whitespace-nowrap ${
                    selectedVisitStatus === st.key
                      ? 'bg-teal-700 text-white shadow-xs'
                      : 'border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  {st.label} ({count})
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 flex-1 sm:max-w-xs">
            <div className="relative flex-1">
              <Search className="h-4 w-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜尋店名、區域或備註..."
                className="w-full rounded-xl border border-stone-300 bg-stone-50 pl-9 pr-8 py-1.5 text-sm font-medium text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => {
                  setSelectedCity('ALL');
                  setSelectedSubCategory('ALL');
                  setSelectedVisitStatus('ALL');
                  setSearchQuery('');
                }}
                title="重設所有篩選"
                className="rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-extrabold text-amber-900 hover:bg-amber-100 cursor-pointer whitespace-nowrap shrink-0"
              >
                重設
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 地點卡片清單（大字雙欄排版，手機單欄、平板電腦雙欄） */}
      {filteredPlaces.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-stone-300 bg-white p-8 sm:p-12 text-center space-y-4">
          {placesInSelectedCity.length > 0 ? (
            <>
              <div className="text-4xl">🔍</div>
              <p className="text-xl font-extrabold text-stone-900">
                {selectedCity !== 'ALL' ? `「${selectedCity}」` : ''}
                目前篩選條件下沒有符合的地點
              </p>
              <p className="text-base font-medium text-stone-600 max-w-md mx-auto">
                {selectedCity !== 'ALL'
                  ? `「${selectedCity}」目前共有 ${placesInSelectedCity.length} 筆收藏地點，但已被目前的「分類」或「狀態」篩選隱藏。`
                  : `清單中共有 ${places.length} 筆地點，但已被目前的篩選條件隱藏。`}
              </p>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSubCategory('ALL');
                    setSelectedVisitStatus('ALL');
                    setSearchQuery('');
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-base font-extrabold text-white shadow-xs hover:bg-amber-700 transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                  重設篩選條件（顯示全部 {placesInSelectedCity.length} 筆地點）
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="text-4xl">📍</div>
              <p className="text-xl font-extrabold text-stone-900">
                {selectedCity !== 'ALL'
                  ? `目前「${selectedCity}」尚未收藏任何地點`
                  : '尚未收藏任何地點'}
              </p>
              <p className="text-base font-medium text-stone-600 max-w-md mx-auto">
                {selectedCity !== 'ALL'
                  ? `💡 只要在最上方輸入店名或貼上 Google Maps 網址，系統就會自動收錄至「${selectedCity}」！`
                  : '在上方輸入店名或貼上 Google Maps 網址即可開始收藏'}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredPlaces.map((place) => (
            <PlaceCard key={place.id} place={place} />
          ))}
        </div>
      )}
    </div>
  );
}
