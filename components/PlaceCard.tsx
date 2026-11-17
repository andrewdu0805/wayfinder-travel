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
      className={`group rounded-2xl border p-4 transition-all flex flex-col justify-between ${
        place.visit_status === 'visited_skip' ||
        place.business_status === 'CLOSED_PERMANENTLY'
          ? 'border-stone-200 bg-stone-100/70 opacity-75'
          : 'border-stone-200/90 bg-white hover:border-stone-300 shadow-2xs hover:shadow-md'
      }`}
    >
      <div>
        {/* Top Row: Region Badge + Category Select + Business Status */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-700">
              <MapPin className="h-3 w-3 text-amber-700" />
              {place.city}・{place.district}
            </span>

            {/* 1-Tap Inline Sub-Category Selector */}
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
              className="rounded-md border border-amber-200/90 bg-amber-50/70 px-2 py-0.5 text-[11px] font-semibold text-amber-950 hover:bg-amber-100/70 focus:outline-none cursor-pointer"
            >
              {categoryConfigs.map((cfg) => (
                <option key={cfg.id} value={cfg.sub_category}>
                  {cfg.primary_label}｜{cfg.sub_label}
                </option>
              ))}
              {!matchedConfig && (
                <option value={place.sub_category}>
                  自訂｜{place.sub_category}
                </option>
              )}
            </select>
          </div>

          <div className="flex items-center gap-1">
            {place.rating && (
              <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
                <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
                {place.rating}
              </span>
            )}
            <button
              type="button"
              title="同步最新 Google 營業時間"
              onClick={handleSingleRefresh}
              className="rounded-md p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  isRefreshingSingle ? 'animate-spin text-teal-700' : ''
                }`}
              />
            </button>
            <button
              type="button"
              title="刪除此收藏"
              onClick={() => deletePlace(place.id)}
              className="rounded-md p-1 text-stone-400 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Title & Address */}
        <div className="mb-2">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-bold text-stone-900 leading-snug">
              {place.name}
            </h3>
            <a
              href={place.google_maps_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-xs font-medium text-teal-700 hover:text-teal-900 shrink-0 mt-0.5"
            >
              地圖
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <p className="text-xs text-stone-500 mt-0.5 line-clamp-1">
            {place.formatted_address}
          </p>
        </div>

        {/* Opening Hours & Stay Time Inline Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-stone-50 px-2.5 py-1.5 text-xs text-stone-600 mb-3">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-teal-700 shrink-0" />
            <span className="truncate max-w-[180px]" title={hoursText}>
              {hoursText}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Business Status Quick Toggle */}
            <select
              aria-label={`${place.name} 營業狀態`}
              value={place.business_status || 'OPERATIONAL'}
              onChange={(e) =>
                updatePlaceInline(place.id, {
                  business_status: e.target.value as BusinessStatus,
                })
              }
              className={`rounded px-1.5 py-0.5 text-[11px] font-medium cursor-pointer border ${
                place.business_status === 'CLOSED_PERMANENTLY'
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : place.business_status === 'CLOSED_TEMPORARILY'
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}
            >
              <option value="OPERATIONAL">🟢 正常營業</option>
              <option value="CLOSED_TEMPORARILY">🟡 今日公休</option>
              <option value="CLOSED_PERMANENTLY">🔴 永久歇業</option>
            </select>

            {/* Stay Duration Inline Adjuster */}
            <div className="inline-flex items-center gap-1 rounded border border-stone-200 bg-white px-1.5 py-0.5">
              <button
                type="button"
                onClick={() =>
                  updatePlaceInline(place.id, {
                    estimated_stay_mins: Math.max(
                      15,
                      (place.estimated_stay_mins || 60) - 15
                    ),
                  })
                }
                className="text-stone-500 hover:text-stone-900 font-bold px-0.5 cursor-pointer"
              >
                -
              </button>
              <span className="text-[11px] font-medium text-stone-800">
                停 {place.estimated_stay_mins}分
              </span>
              <button
                type="button"
                onClick={() =>
                  updatePlaceInline(place.id, {
                    estimated_stay_mins: Math.min(
                      360,
                      (place.estimated_stay_mins || 60) + 15
                    ),
                  })
                }
                className="text-stone-500 hover:text-stone-900 font-bold px-0.5 cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Inline Editable Notes (Click to edit immediately) */}
        <div className="mb-3">
          {isEditingNote ? (
            <div className="space-y-1.5">
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
                className="w-full rounded-lg border border-amber-500 bg-amber-50/20 px-2.5 py-1.5 text-xs text-stone-800 focus:outline-none"
                placeholder="輸入必點菜色、排隊秘訣或看展筆記（按 Enter 自動儲存）..."
              />
            </div>
          ) : (
            <div
              onClick={() => {
                setNoteDraft(place.user_notes || '');
                setIsEditingNote(true);
              }}
              title="點擊直接修改備註"
              className="rounded-lg border border-transparent hover:border-stone-200 hover:bg-stone-50/80 px-2 py-1 -mx-2 text-xs text-stone-600 cursor-text transition-colors min-h-[34px] flex items-center"
            >
              {place.user_notes ? (
                <span>📝 {place.user_notes}</span>
              ) : (
                <span className="text-stone-400 italic">
                  + 點此隨手新增筆記（如：必點鴨肉飯、需預約）...
                </span>
              )}
            </div>
          )}
        </div>

        {/* Custom Tags Row + Inline Tag Adder */}
        <div className="flex flex-wrap items-center gap-1 mb-3.5">
          {(place.custom_tags || []).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600"
            >
              {tag}
              <button
                type="button"
                onClick={() => handleRemoveTag(tag)}
                className="text-stone-400 hover:text-stone-800 cursor-pointer"
              >
                ×
              </button>
            </span>
          ))}
          <form onSubmit={handleAddTag} className="inline-flex items-center">
            <input
              type="text"
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              placeholder="+標籤"
              className="w-14 focus:w-24 rounded-full border border-dashed border-stone-300 px-2 py-0.5 text-[11px] text-stone-700 placeholder:text-stone-400 focus:border-amber-600 focus:outline-none transition-all"
            />
            {tagDraft && (
              <button
                type="submit"
                className="ml-0.5 text-amber-700 hover:text-amber-900 cursor-pointer"
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Bottom Row: 1-Tap Visit Status Switcher */}
      <div className="pt-2.5 border-t border-stone-100 flex items-center justify-between gap-2">
        <div className="grid grid-cols-3 gap-1 w-full rounded-xl bg-stone-100 p-1">
          {(
            [
              {
                key: 'unvisited',
                label: '🌟 沒去過',
                activeClass: 'bg-emerald-700 text-white shadow-2xs',
              },
              {
                key: 'visited_revisit',
                label: '❤️ 想再去',
                activeClass: 'bg-amber-700 text-white shadow-2xs',
              },
              {
                key: 'visited_skip',
                label: '🚫 去過不推',
                activeClass: 'bg-stone-700 text-white shadow-2xs',
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
                className={`rounded-lg py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  isActive
                    ? item.activeClass
                    : 'text-stone-600 hover:text-stone-900 hover:bg-white/60'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </article>
  );
}
