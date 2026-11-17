'use client';

import React, { useState } from 'react';
import {
  Clock,
  ExternalLink,
  MapPin,
  Plus,
  RefreshCw,
  Star,
  Trash2,
} from 'lucide-react';
import { usePlaces } from '@/context/PlacesContext';
import { BusinessStatus, SavedPlace, VisitStatus } from '@/types/place';

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

  const matchedConfig = categoryConfigs.find(
    (c) => c.sub_category === place.sub_category
  );

  const hoursText =
    place.opening_hours_json?.weekday_descriptions?.[0] ||
    (place.opening_hours_json?.daily_hours
      ? `每日 ${place.opening_hours_json.daily_hours.open}–${place.opening_hours_json.daily_hours.close}`
      : '營業時間依現場公告');

  return (
    <>
      <article
        id={`place-card-${place.id}`}
        className={`rounded-2xl border-2 p-5 transition-all flex flex-col justify-between gap-4 ${
          place.visit_status === 'visited_skip'
            ? 'border-stone-200 bg-stone-100/80 opacity-75'
            : 'border-stone-200 bg-white hover:border-stone-300 shadow-xs'
        }`}
      >
        <div className="space-y-3">
          {/* 第一排：地區 ＋ 地圖按鈕（在地區右側） ＋ 分類選單 ＋ 評分 ＋ 刪除 */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-xl bg-stone-100 px-3 py-1.5 text-sm sm:text-base font-extrabold text-stone-700">
                <MapPin className="h-4 w-4 text-amber-700" />
                {place.city}・{place.district}
              </span>

              {/* 地圖按鈕：直接放在地區的右側，不佔用店名空間 */}
              <a
                href={place.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-xl border border-teal-300 bg-teal-50 px-3 py-1.5 text-sm sm:text-base font-extrabold text-teal-800 hover:bg-teal-100 transition-colors"
              >
                🗺️ 地圖
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="flex flex-wrap items-center gap-2">
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
                className="rounded-xl border-2 border-amber-300 bg-amber-50 px-2.5 py-1.5 text-sm sm:text-base font-extrabold text-amber-950 hover:bg-amber-100 focus:outline-none cursor-pointer"
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

              {place.rating && (
                <span className="inline-flex items-center gap-1 text-sm sm:text-base font-extrabold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg">
                  <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                  {place.rating}
                </span>
              )}

              {/* 刪除按鈕（包含確認對話框） */}
              <button
                type="button"
                title="刪除此收藏地點"
                onClick={() => {
                  if (confirm(`確定要刪除「${place.name}」嗎？`)) {
                    deletePlace(place.id);
                  }
                }}
                className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2.5 py-1.5 text-sm font-extrabold text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
              >
                <Trash2 className="h-4 w-4" />
                刪除
              </button>
            </div>
          </div>

          {/* 第二排：地點名稱（單獨一行、完整 100% 寬度不折疊） */}
          <div className="w-full pt-1">
            <h3 className="text-xl sm:text-2xl font-extrabold text-stone-900 leading-snug break-words">
              {place.name}
            </h3>
          </div>

          {/* 第三排：點擊彈出說明框按鈕 ＋ 停留時間與營業時間 */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-stone-100">
            <button
              type="button"
              onClick={() => {
                setNoteDraft(place.user_notes || '');
                setIsNoteModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 px-3 py-1.5 text-sm sm:text-base font-extrabold text-amber-950 transition-colors cursor-pointer"
            >
              📝 說明／備註
              {place.user_notes ? (
                <span className="max-w-[150px] sm:max-w-[220px] truncate text-xs sm:text-sm font-normal text-amber-800">
                  ({place.user_notes})
                </span>
              ) : (
                <span className="text-xs font-normal text-stone-400">（點擊填寫）</span>
              )}
            </button>

            <span className="text-xs sm:text-sm font-bold text-stone-500">
              ⏱️ {place.estimated_stay_mins} 分鐘 ｜ {hoursText}
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
              <label className="block text-base font-extrabold text-stone-800">
                店家必點推薦或心得備註：
              </label>
              <textarea
                rows={5}
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                className="w-full rounded-xl border-2 border-stone-300 p-3.5 text-base font-medium text-stone-900 focus:border-amber-600 focus:outline-none"
                placeholder="例如：必點古法燻羊肉、蒜油麵線，假日人多需先預約..."
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
