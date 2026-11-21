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

  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState(place.user_notes || '');
  const [hoursDraft, setHoursDraft] = useState(
    place.opening_hours_json?.weekday_descriptions?.[0] ||
      (place.opening_hours_json?.daily_hours
        ? `每日 ${place.opening_hours_json.daily_hours.open}–${place.opening_hours_json.daily_hours.close}`
        : '')
  );
  const [isEnrichingNote, setIsEnrichingNote] = useState(false);
  const [syncedPatch, setSyncedPatch] = useState<Partial<SavedPlace> | null>(
    null
  );
  const [syncSummaryList, setSyncSummaryList] = useState<string[]>([]);

  const handleFetchGoogleMapsSummary = async () => {
    setIsEnrichingNote(true);
    setSyncSummaryList([]);
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
        const changes: string[] = [];

        // 1. 縣市與行政區
        const nextCity = enriched.city || place.city;
        const nextDist = enriched.district || place.district;
        if (nextCity !== place.city || nextDist !== place.district) {
          patch.city = nextCity;
          patch.district = nextDist;
          changes.push(`行政區：${place.city}・${place.district} → ${nextCity}・${nextDist}`);
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
        const shouldUpdateCat =
          enriched.sub_category &&
          enriched.sub_category !== place.sub_category &&
          !(place.sub_category !== 'meal' && enriched.sub_category === 'meal');
        if (shouldUpdateCat) {
          patch.primary_category = enriched.primary_category;
          patch.sub_category = enriched.sub_category;
          patch.estimated_stay_mins =
            enriched.estimated_stay_mins || place.estimated_stay_mins;
          const oldLabel =
            categoryConfigs.find((c) => c.sub_category === place.sub_category)
              ?.sub_label || place.sub_category;
          const newLabel =
            categoryConfigs.find((c) => c.sub_category === enriched.sub_category)
              ?.sub_label || enriched.sub_category;
          changes.push(`分類：${oldLabel} → ${newLabel}`);
        }

        // 3. 營業時間（絕不以預設 10:00–21:00 覆蓋真實營業時間）
        if (
          enriched.opening_hours_json &&
          (!isDefaultHours(enriched.opening_hours_json) ||
            isDefaultHours(place.opening_hours_json))
        ) {
          const oldHr =
            place.opening_hours_json?.weekday_descriptions?.[0] || '';
          const newHr =
            enriched.opening_hours_json.weekday_descriptions?.[0] || '';
          if (!isDefaultHours(enriched.opening_hours_json)) {
            patch.opening_hours_json = enriched.opening_hours_json;
            const todayIdx = (new Date().getDay() + 6) % 7;
            const displayHr =
              enriched.opening_hours_json.weekday_descriptions?.[todayIdx] ||
              newHr;
            setHoursDraft(displayHr);
            if (newHr && newHr !== oldHr) {
              changes.push(`營業時間：${displayHr}`);
            }
          } else if (!settings.googleMapsApiKey && !settings.geminiApiKey) {
            changes.push('⚠️ 營業時間未更新（尚未於設定填入 Google Maps 或 Gemini API Key）');
          }
        }

        // 4. 店名與評分
        if (enriched.name && enriched.name !== place.name) {
          patch.name = enriched.name;
          changes.push(`店名：${enriched.name}`);
        }
        if (typeof enriched.rating === 'number') {
          patch.rating = enriched.rating;
        }
        if (enriched.business_status) {
          patch.business_status = enriched.business_status;
        }

        // 5. 評論摘要
        const nextSubForNote = patch.sub_category || place.sub_category;
        const nextPrimaryForNote = patch.primary_category || place.primary_category;
        let nextDesc = (enriched.user_notes || '').trim();
        if (
          !nextDesc ||
          !/[\u4e00-\u9fff]/.test(nextDesc) ||
          (nextPrimaryForNote !== 'restaurant' &&
            nextDesc.includes('這家餐廳的餐點美味'))
        ) {
          nextDesc = resolvePlaceDescription(
            patch.name || place.name,
            nextCity,
            nextDist,
            nextSubForNote,
            patch.formatted_address || place.formatted_address
          );
        }
        if (nextDesc) {
          setNoteDraft(nextDesc);
          if (nextDesc !== (place.user_notes || '').trim()) {
            changes.push('評論摘要已更新');
          }
        }

        setSyncedPatch(Object.keys(patch).length > 0 ? patch : null);
        setSyncSummaryList(
          changes.length > 0 ? changes : ['資料皆已與 Google Maps 一致']
        );
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
      setSyncSummaryList(['已套用本地評論摘要']);
    } finally {
      setIsEnrichingNote(false);
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

            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-base font-extrabold text-stone-800">
                  店家必點推薦或心得備註：
                </label>
                <button
                  type="button"
                  disabled={isEnrichingNote}
                  onClick={handleFetchGoogleMapsSummary}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50 transition-colors cursor-pointer"
                  title="依 Google Maps 網址同步修正行政區、分類、營業時間與評論摘要"
                >
                  <Sparkles className={`h-3.5 w-3.5 text-amber-600 ${isEnrichingNote ? 'animate-spin' : ''}`} />
                  {isEnrichingNote
                    ? '同步 Google Maps 資訊中...'
                    : '同步 Google Maps（行政區／分類／營業時間／摘要）'}
                </button>
              </div>

              {syncSummaryList.length > 0 && (
                <div className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-xs font-bold text-teal-900 space-y-0.5">
                  <p className="text-teal-800">✨ 已依 Google Maps 網址偵測並準備套用：</p>
                  <ul className="list-disc pl-4 space-y-0.5 font-medium">
                    {syncSummaryList.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              <textarea
                rows={5}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                className="w-full rounded-xl border-2 border-stone-300 p-3.5 text-base font-medium text-stone-900 focus:border-amber-600 focus:outline-none"
                placeholder="例如：牛肉新鮮軟嫩，點牛肉湯可無限續湯並免費享用美味牛肉燥飯..."
                autoFocus
              />

              <div className="space-y-1 pt-1">
                <label className="block text-sm font-extrabold text-stone-700">
                  🕒 營業時間（同步 Google Maps 或手動微調）：
                </label>
                <input
                  type="text"
                  value={hoursDraft}
                  onChange={(e) => setHoursDraft(e.target.value)}
                  placeholder="例如：週二至週日 11:00–21:00（週一公休）或 24 小時營業"
                  className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm font-medium text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-stone-100">
              <button
                type="button"
                onClick={() => {
                  setSyncedPatch(null);
                  setSyncSummaryList([]);
                  setIsNoteModalOpen(false);
                }}
                className="rounded-xl px-4 py-2 text-base font-bold text-stone-600 hover:bg-stone-100 cursor-pointer"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  const trimmedHours = hoursDraft.trim();
                  let finalHours = syncedPatch?.opening_hours_json;
                  if (!finalHours && trimmedHours && trimmedHours !== hoursText) {
                    const tm = trimmedHours.match(
                      /(\d{1,2}):(\d{2})\s*[–\-~至到]\s*(\d{1,2}):(\d{2})/
                    );
                    finalHours = {
                      open_now: true,
                      weekday_descriptions: [trimmedHours],
                      daily_hours: /24\s*小時/.test(trimmedHours)
                        ? { open: '00:00', close: '23:59' }
                        : tm
                        ? {
                            open: `${tm[1].padStart(2, '0')}:${tm[2]}`,
                            close: `${tm[3].padStart(2, '0')}:${tm[4]}`,
                          }
                        : place.opening_hours_json?.daily_hours || {
                            open: '10:00',
                            close: '21:00',
                          },
                    };
                  }
                  updatePlaceInline(place.id, {
                    ...(syncedPatch || {}),
                    ...(finalHours ? { opening_hours_json: finalHours } : {}),
                    user_notes: noteDraft.trim(),
                  });
                  setSyncedPatch(null);
                  setSyncSummaryList([]);
                  setIsNoteModalOpen(false);
                }}
                className="rounded-xl bg-amber-600 hover:bg-amber-700 px-5 py-2 text-base font-extrabold text-white shadow-md cursor-pointer"
              >
                {syncedPatch ? '儲存說明並套用同步修正' : '儲存說明'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
