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
    settings,
  } = usePlaces();

  const [isSyncingCard, setIsSyncingCard] = useState(false);

  const handleSyncFromGoogleMaps = async () => {
    setIsSyncingCard(true);
    try {
      const res = await fetch('/api/smart-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batch: [
            {
              url: place.google_maps_url || '',
              title: place.name,
              note: '',
              rowCoords:
                place.latitude && place.longitude
                  ? { lat: place.latitude, lng: place.longitude }
                  : null,
            },
          ],
          defaultCity: place.city || '台南市',
          categoryConfigs,
          geminiApiKey: settings.geminiApiKey,
          googleMapsApiKey: settings.googleMapsApiKey,
        }),
      });

      const data = await res.json();
      const enriched: SavedPlace | undefined = data.places?.[0];

      if (enriched) {
        const isDefaultHours = (h?: SavedPlace['opening_hours_json']) =>
          !h?.weekday_descriptions?.length ||
          (h.weekday_descriptions.length === 1 &&
            h.weekday_descriptions[0] === '每日 10:00–21:00');

        const patch: Partial<SavedPlace> = {};

        // 1. 縣市與行政區
        if (enriched.city) patch.city = enriched.city;
        if (enriched.district && enriched.district !== enriched.city) {
          patch.district = enriched.district;
        }
        if (enriched.country) patch.country = enriched.country;
        if (
          enriched.formatted_address &&
          /[路街段巷弄號大道]/.test(enriched.formatted_address)
        ) {
          patch.formatted_address = enriched.formatted_address;
        }
        if (enriched.latitude && enriched.longitude) {
          patch.latitude = enriched.latitude;
          patch.longitude = enriched.longitude;
        }
        if (enriched.google_place_id) {
          patch.google_place_id = enriched.google_place_id;
        }

        // 2. 分類（絕不將已明確分類的非正餐降級回正餐）
        if (
          enriched.sub_category &&
          enriched.sub_category !== place.sub_category &&
          !(place.sub_category !== 'meal' && enriched.sub_category === 'meal')
        ) {
          patch.primary_category = enriched.primary_category;
          patch.sub_category = enriched.sub_category;
          patch.estimated_stay_mins =
            enriched.estimated_stay_mins || place.estimated_stay_mins;
        }

        // 3. 營業時間（絕不以預設 10:00–21:00 覆蓋真實營業時間）
        if (
          enriched.opening_hours_json &&
          !isDefaultHours(enriched.opening_hours_json)
        ) {
          patch.opening_hours_json = enriched.opening_hours_json;
        }

        // 4. 店名與評分
        if (enriched.name) patch.name = enriched.name;
        if (typeof enriched.rating === 'number') patch.rating = enriched.rating;
        if (enriched.business_status) {
          patch.business_status = enriched.business_status;
        }

        if (Object.keys(patch).length > 0) {
          updatePlaceInline(place.id, patch);
        }
      }
    } catch {
      // ignore network error
    } finally {
      setIsSyncingCard(false);
    }
  };

  const matchedConfig = categoryConfigs.find(
    (c) => c.sub_category === place.sub_category
  );

  const weekdayList = place.opening_hours_json?.weekday_descriptions || [];
  const primaryWeekdayDesc =
    weekdayList.find((d) => d && !/休息|公休|Closed/i.test(d)) ||
    weekdayList[0];
  const hoursText =
    primaryWeekdayDesc ||
    (place.opening_hours_json?.daily_hours
      ? `每日 ${place.opening_hours_json.daily_hours.open}–${place.opening_hours_json.daily_hours.close}`
      : '營業時間依現場公告');

  const cityDistricts = CITY_DISTRICTS_MAP[place.city] || [];
  const availableDistricts =
    !place.district ||
    place.district === place.city ||
    cityDistricts.includes(place.district)
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

          {/* 第 4 排：停留時間與營業時間 ＋ 一鍵同步 Google Maps */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
            <span className="min-w-0 truncate text-xs sm:text-sm font-bold text-stone-500">
              ⏱️ {place.estimated_stay_mins}分 ｜ {hoursText}
            </span>

            <button
              type="button"
              disabled={isSyncingCard}
              onClick={handleSyncFromGoogleMaps}
              title="依 Google Maps 網址同步行政區、分類與營業時間"
              className="shrink-0 inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 hover:bg-amber-50 hover:border-amber-300 px-2.5 py-1 text-xs font-extrabold text-stone-700 hover:text-amber-900 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Sparkles
                className={`h-3.5 w-3.5 text-amber-600 ${
                  isSyncingCard ? 'animate-spin' : ''
                }`}
              />
              <span>{isSyncingCard ? '同步中...' : '同步地圖資訊'}</span>
            </button>
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
    </>
  );
}
