'use client';

import React, { useState } from 'react';
import {
  Clock,
  ExternalLink,
  MapPin,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { usePlaces } from '@/context/PlacesContext';
import {
  getCoordinatesForRegion,
  ALL_TAIWAN_CITY_DISTRICTS,
} from '@/lib/geo-utils';
import { resolvePlaceDescription } from '@/lib/place-notes';
import { BusinessStatus, SavedPlace, VisitStatus } from '@/types/place';

const CITY_DISTRICTS_MAP = ALL_TAIWAN_CITY_DISTRICTS;

interface PlaceCardProps {
  place: SavedPlace;
}

export function PlaceCard({ place }: PlaceCardProps) {
  const {
    categoryConfigs,
    updatePlaceInline,
    deletePlace,
  } = usePlaces();

  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(place.user_notes || '');
  const [isEnrichingNote, setIsEnrichingNote] = useState(false);

  const handleFetchGoogleMapsSummary = async () => {
    setIsEnrichingNote(true);
    try {
      const res = await fetch('/api/enrich-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: place.name,
          city: place.city,
          district: place.district,
          address: place.formatted_address,
          googleMapsUrl: place.google_maps_url,
        }),
      });
      const data = await res.json();
      if (data.description) {
        setNoteDraft(data.description);
      }
    } catch {
      const freshDesc = resolvePlaceDescription(
        place.name,
        place.city,
        place.district,
        place.sub_category,
        place.formatted_address
      );
      setNoteDraft(freshDesc);
    } finally {
      setIsEnrichingNote(false);
    }
  };

  const matchedConfig = categoryConfigs.find(
    (c) => c.sub_category === place.sub_category
  );

  const hoursText =
    place.opening_hours_json?.weekday_descriptions?.[0] ||
    (place.opening_hours_json?.daily_hours
      ? `每日 ${place.opening_hours_json.daily_hours.open}–${place.opening_hours_json.daily_hours.close}`
      : '營業時間依現場公告');

  const cityDistricts = CITY_DISTRICTS_MAP[place.city] || [];
  const availableDistricts = cityDistricts.includes(place.district)
    ? cityDistricts
    : [place.district, ...cityDistricts];

  return (
    <>
      <article
        id={`place-card-${place.id}`}
        className={`rounded-2xl border-2 p-3.5 sm:p-4 transition-all flex flex-col justify-between gap-3 ${
          place.visit_status === 'visited_skip'
            ? 'border-stone-200 bg-stone-100/80 opacity-75'
            : 'border-stone-200 bg-white hover:border-stone-300 shadow-xs'
        }`}
      >
        <div className="space-y-2.5">
          {/* 第 1 排：地區選單 ＋ 地圖按鈕（左右對齊） */}
          <div className="flex items-center justify-between gap-2">
            {/* 行政區切換下拉選單 */}
            <div className="relative inline-flex items-center max-w-[200px] sm:max-w-xs">
              <MapPin className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-amber-700 shrink-0" />
              <select
                aria-label={`${place.name} 行政區切換`}
                value={place.district}
                onChange={(e) => {
                  const nextDist = e.target.value;
                  const newCoords = getCoordinatesForRegion(
                    place.city,
                    nextDist,
                    place.name
                  );
                  const freshNotes = resolvePlaceDescription(
                    place.name,
                    place.city,
                    nextDist,
                    place.sub_category,
                    place.formatted_address
                  );
                  updatePlaceInline(place.id, {
                    district: nextDist,
                    latitude: newCoords.lat,
                    longitude: newCoords.lng,
                    user_notes: freshNotes,
                  });
                }}
                className="appearance-none rounded-xl border border-stone-200 bg-stone-100 pl-6.5 pr-6 py-1 text-xs sm:text-sm font-extrabold text-stone-800 hover:bg-stone-200 hover:border-stone-300 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer transition-colors truncate"
                title="點擊可手動修正或更換行政區"
              >
                {availableDistricts.map((d) => (
                  <option key={d} value={d}>
                    📍 {place.city}・{d}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-2 text-[10px] text-stone-500">
                ▼
              </span>
            </div>

            {/* 地圖按鈕：直接放在地區同列右側 */}
            <a
              href={place.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-xl border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs sm:text-sm font-extrabold text-teal-800 hover:bg-teal-100 transition-colors shrink-0"
            >
              🗺️ 地圖
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* 第 2 排：分類選單（左） ＋ 刪除鍵（右，移到原本星星的位置，空間利用最好！） */}
          <div className="flex items-center justify-between gap-2">
            {/* 分類切換下拉選單 */}
            <select
              aria-label={`${place.name} 分類切換`}
              value={place.sub_category}
              onChange={(e) => {
                const nextSub = e.target.value;
                const cfg = categoryConfigs.find(
                  (c) => c.sub_category === nextSub
                );
                if (cfg) {
                  updatePlaceInline(place.id, {
                    primary_category: cfg.primary_category,
                    sub_category: cfg.sub_category,
                    estimated_stay_mins: cfg.default_stay_mins,
                  });
                }
              }}
              className="flex-1 min-w-0 max-w-[210px] sm:max-w-xs rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs sm:text-sm font-extrabold text-amber-950 hover:bg-amber-100 focus:outline-none cursor-pointer truncate"
            >
              {categoryConfigs.map((cfg) => (
                <option key={cfg.id} value={cfg.sub_category}>
                  🏷️ {cfg.sub_label}
                </option>
              ))}
              {!matchedConfig && (
                <option value={place.sub_category}>
                  🏷️ {place.sub_category}
                </option>
              )}
            </select>

            {/* 刪除按鈕：移到原評價星星的位置，不佔獨立列！ */}
            <button
              type="button"
              title="刪除此收藏地點"
              onClick={() => {
                if (confirm(`確定要刪除「${place.name}」嗎？`)) {
                  deletePlace(place.id);
                }
              }}
              className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1 text-xs sm:text-sm font-extrabold text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
              刪除
            </button>
          </div>

          {/* 第 3 排：地點名稱（單獨一行、完整 100% 寬度不折疊） */}
          <div className="w-full pt-0.5">
            <h3 className="text-lg sm:text-xl font-black text-stone-900 leading-snug break-words">
              {place.name}
            </h3>
          </div>

          {/* 第 4 排：說明／備註按鈕 ＋ 停留時間與營業時間（單行對齊不折行） */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={() => {
                setNoteDraft(place.user_notes || '');
                setIsNoteModalOpen(true);
              }}
              className="min-w-0 shrink inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 text-xs sm:text-sm font-extrabold text-amber-950 transition-colors cursor-pointer truncate"
            >
              <span className="shrink-0">📝 說明／備註</span>
              {place.user_notes ? (
                <span className="truncate max-w-[90px] sm:max-w-[180px] font-normal text-amber-800">
                  ({place.user_notes})
                </span>
              ) : null}
            </button>

            <span className="shrink-0 text-xs sm:text-sm font-bold text-stone-500 whitespace-nowrap">
              ⏱️ {place.estimated_stay_mins}分 ｜ {hoursText}
            </span>
          </div>
        </div>

        {/* 第四排：三大造訪狀態大按鈕 */}
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-stone-100 p-1.5 mt-1">
          {(
            [
              {
                key: 'unvisited',
                label: '🌟 想去',
                activeClass: 'bg-emerald-700 text-white shadow-xs',
              },
              {
                key: 'visited_revisit',
                label: '❤️ 想再去',
                activeClass: 'bg-amber-600 text-white shadow-xs',
              },
              {
                key: 'visited_skip',
                label: '🚫 不推薦',
                activeClass: 'bg-stone-700 text-white shadow-xs',
              },
            ] as Array<{
              key: VisitStatus;
              label: string;
              activeClass: string;
            }>
          ).map((item) => {
            const isActive = place.visit_status === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() =>
                  updatePlaceInline(place.id, { visit_status: item.key })
                }
                className={`rounded-lg py-2.5 text-base font-extrabold transition-all cursor-pointer ${
                  isActive
                    ? item.activeClass
                    : 'text-stone-600 hover:text-stone-900 hover:bg-white/70'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </article>

      {/* 點擊跳出說明框 (Modal) */}
      {isNoteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📝</span>
                <div>
                  <h3 className="text-xl font-extrabold text-stone-900">
                    地點說明／備註框
                  </h3>
                  <p className="text-sm font-bold text-amber-700">{place.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNoteModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 text-2xl font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-base font-extrabold text-stone-800">
                  店家必點推薦或心得備註：
                </label>
                <button
                  type="button"
                  disabled={isEnrichingNote}
                  onClick={handleFetchGoogleMapsSummary}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50 transition-colors cursor-pointer"
                  title="依所在行政區重新套用 Google Maps 評論摘要"
                >
                  <Sparkles className={`h-3 w-3 text-amber-600 ${isEnrichingNote ? 'animate-spin' : ''}`} />
                  {isEnrichingNote ? '擷取摘要中...' : `重新套用 ${place.district} Google Maps 評論摘要`}
                </button>
              </div>
              <textarea
                rows={5}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                className="w-full rounded-xl border-2 border-stone-300 p-3.5 text-base font-medium text-stone-900 focus:border-amber-600 focus:outline-none"
                placeholder="例如：牛肉新鮮軟嫩，點牛肉湯可無限續湯並免費享用美味牛肉燥飯..."
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setIsNoteModalOpen(false)}
                className="rounded-xl px-4 py-2 text-base font-bold text-stone-600 hover:bg-stone-100 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  updatePlaceInline(place.id, { user_notes: noteDraft.trim() });
                  setIsNoteModalOpen(false);
                }}
                className="rounded-xl bg-amber-600 hover:bg-amber-700 px-5 py-2 text-base font-extrabold text-white shadow-md cursor-pointer"
              >
                儲存說明
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
