'use client';

import React, { useEffect, useState } from 'react';
import {
  BookmarkCheck,
  Compass,
  Database,
  MapPin,
  Settings,
  Sparkles,
} from 'lucide-react';
import { usePlaces } from '@/context/PlacesContext';
import { PlacesManagerView } from './PlacesManagerView';
import { ItineraryPlannerView } from './ItineraryPlannerView';
import { CategoryAndSettingsModal } from './CategoryAndSettingsModal';

interface AppShellProps {
  initialTab?: 'places' | 'planner';
}

export function AppShell({ initialTab = 'places' }: AppShellProps) {
  const { places, settings, smartUpsertPlaces } = usePlaces();
  const [activeTab, setActiveTab] = useState<'places' | 'planner'>(initialTab);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const unvisitedCount = places.filter(
    (p) => p.visit_status === 'unvisited'
  ).length;
  const revisitCount = places.filter(
    (p) => p.visit_status === 'visited_revisit'
  ).length;

  // Handle PWA Web Share Target query params (?share_text=...&share_url=...)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const sharedText = [
      params.get('share_title'),
      params.get('share_text'),
      params.get('share_url'),
    ]
      .filter(Boolean)
      .join(' ');

    if (sharedText.trim()) {
      fetch('/api/smart-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: sharedText.trim(),
          defaultCity: '高雄市',
          geminiApiKey: settings.geminiApiKey,
          googleMapsApiKey: settings.googleMapsApiKey,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.places?.length) {
            smartUpsertPlaces(data.places);
          }
        })
        .catch(() => {});

      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [settings.geminiApiKey, settings.googleMapsApiKey, smartUpsertPlaces]);

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-stone-900 flex flex-col">
      {/* Top Navigation Header */}
      <header className="sticky top-0 z-30 border-b border-stone-200/90 bg-white/95 backdrop-blur-md">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Brand Title */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-900 text-amber-400 shadow-xs">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-extrabold tracking-tight text-stone-900">
                  Wayfinder 旅途動態串聯與景點庫
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                  <Database className="h-3 w-3" />
                  本機自動保存＋雲端雙引擎
                </span>
              </div>
              <p className="text-xs text-stone-500">
                隨手貼連結／IG文案秒存自動去重 · 旅途現場一鍵打卡與換站 · 免改 SQL 彈性分類
              </p>
            </div>
          </div>

          {/* Primary Mode Switcher + Settings Trigger */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-stone-200 bg-stone-100 p-1">
              <button
                id="nav-tab-places"
                type="button"
                onClick={() => setActiveTab('places')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  activeTab === 'places'
                    ? 'bg-stone-900 text-white shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <BookmarkCheck className="h-4 w-4 text-amber-400" />
                景點庫與秒存更新 ({places.length})
              </button>
              <button
                id="nav-tab-planner"
                type="button"
                onClick={() => setActiveTab('planner')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                  activeTab === 'planner'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                <Sparkles className="h-4 w-4" />
                抵達當地・依想法串聯
              </button>
            </div>

            <button
              id="btn-header-settings"
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-colors cursor-pointer"
            >
              <Settings className="h-4 w-4 text-stone-600" />
              <span className="hidden md:inline">彈性分類 & API 設定</span>
            </button>
          </div>
        </div>

        {/* Sub-Header Status Strip */}
        <div className="border-t border-stone-100 bg-stone-50/80 px-4 sm:px-6 py-1.5">
          <div className="mx-auto max-w-7xl flex flex-wrap items-center justify-between gap-2 text-xs text-stone-600">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5 text-amber-600" />
                總收藏：<strong>{places.length}</strong> 筆
              </span>
              <span>
                🌟 沒去過：<strong className="text-emerald-700">{unvisitedCount}</strong> 筆
              </span>
              <span>
                ❤️ 去過想再去：<strong className="text-amber-700">{revisitCount}</strong> 筆
              </span>
            </div>
            <div className="text-[11px] text-stone-500">
              提示：點選任何卡片上的分類、造訪狀態或備註皆可「1 秒行內直接改」，無須跳出繁瑣表單
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 py-6">
        {activeTab === 'places' ? (
          <PlacesManagerView
            onOpenSettingsModal={() => setIsSettingsOpen(true)}
          />
        ) : (
          <ItineraryPlannerView />
        )}
      </main>

      {/* Settings & Flexible Category Modal */}
      <CategoryAndSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
