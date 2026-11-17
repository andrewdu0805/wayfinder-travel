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
    refreshPlacesHours,
  } = usePlaces();

  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(place.user_notes || '');
  const [tagDraft, setTagDraft] = useState('');
  const [isRefreshingSingle, setIsRefreshingSingle] = useState(false);

  const matchedConfig = categoryConfigs.find(
    (c) => c.sub_category === place.sub_category
  );

  const handleSaveNote = () => {
    setIsEditingNote(false);
    if (noteDraft.trim() !== (place.user_notes || '').trim()) {
      updatePlaceInline(place.id, { user_notes: noteDraft.trim() });
    }
  };

  const handleAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = tagDraft.trim();
    if (!raw) return;
    const formatted = raw.startsWith('#') ? raw : `#${raw}`;
    if (!place.custom_tags.includes(formatted)) {
      updatePlaceInline(place.id, {
        custom_tags: [...place.custom_tags, formatted],
      });
    }
    setTagDraft('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    updatePlaceInline(place.id, {
      custom_tags: place.custom_tags.filter((t) => t !== tagToRemove),
    });
  };

  const handleSingleRefresh = async () => {
    setIsRefreshingSingle(true);
    try {
      await refreshPlacesHours([place]);
    } finally {
      setIsRefreshingSingle(false);
    }
  };

  const hoursText =
    place.opening_hours_json?.weekday_descriptions?.[0] ||
    (place.opening_hours_json?.daily_hours
      ? `每日 ${place.opening_hours_json.daily_hours.open}–${place.opening_hours_json.daily_hours.close}`
      : '營業時間依現場公告');

  return (
    <article
      id={`place-card-${place.id}`}
      className={`rounded-2xl border-2 p-5 transition-all flex flex-col justify-between gap-4 ${
        place.visit_status === 'visited_skip'
          ? 'border-stone-200 bg-stone-100/80 opacity-75'
          : 'border-stone-200 bg-white hover:border-stone-300 shadow-xs'
      }`}
    >
      <div className="space-y-3">
        {/* 第一排：地區 ＋ 大字分類下拉選單 ＋ 刪除 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-xl bg-stone-100 px-3 py-1.5 text-sm sm:text-base font-extrabold text-stone-700">
              <MapPin className="h-4 w-4 text-amber-700" />
              {place.city}・{place.district}
            </span>

            {/* 一鍵切換分類（大字體） */}
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
              className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-1.5 text-sm sm:text-base font-extrabold text-amber-950 hover:bg-amber-100 focus:outline-none cursor-pointer"
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
          </div>

          <div className="flex items-center gap-2">
            {place.rating && (
              <span className="inline-flex items-center gap-1 text-sm sm:text-base font-extrabold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg">
                <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                {place.rating}
              </span>
            )}
            <button
              type="button"
              title="刪除此收藏"
              onClick={() => deletePlace(place.id)}
              className="rounded-xl p-2 text-stone-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 第二排：大字店名 ＋ Google Maps 連結 */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-xl font-extrabold text-stone-900 leading-snug">
            {place.name}
          </h3>
          <a
            href={place.google_maps_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-xl border border-teal-200 bg-teal-50 px-3 py-1.5 text-sm font-extrabold text-teal-800 hover:bg-teal-100 shrink-0"
          >
            地圖
            <ExternalLink className="h-4 w-4" />
          </a>
        </div>

        {/* 第三排：備註（直接點選修改，大字好讀） */}
        <div>
          {isEditingNote ? (
            <textarea
              rows={2}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onBlur={handleSaveNote}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSaveNote();
                }
              }}
              autoFocus
              className="w-full rounded-xl border-2 border-amber-500 bg-amber-50/30 px-3.5 py-2 text-base font-medium text-stone-900 focus:outline-none"
              placeholder="輸入必點菜色或筆記（按 Enter 儲存）..."
            />
          ) : (
            <div
              onClick={() => {
                setNoteDraft(place.user_notes || '');
                setIsEditingNote(true);
              }}
              title="點擊修改備註"
              className="rounded-xl border border-stone-200 bg-stone-50/80 hover:bg-stone-100/80 px-3.5 py-2.5 text-base text-stone-700 cursor-text transition-colors"
            >
              {place.user_notes ? (
                <span>📝 {place.user_notes}</span>
              ) : (
                <span className="text-stone-400">
                  ＋ 點此新增筆記（如：必點菜色、排隊提醒）...
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 第四排：三大造訪狀態大按鈕 */}
      <div className="grid grid-cols-3 gap-2 rounded-xl bg-stone-100 p-1.5">
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
  );
}
