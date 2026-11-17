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
      {/* Top Navigation Header — Clean, Large Font, 2 Independent Sections */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur-md shadow-xs">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-stone-900 text-amber-400 shadow-xs">
                <Compass className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-stone-900">
                  Wayfinder 順路旅遊助手
                </h1>
              </div>
            </div>

            <button
              id="btn-header-settings"
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2 text-sm sm:text-base font-bold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              <Settings className="h-5 w-5 text-stone-600" />
              <span>分類設定</span>
            </button>
          </div>

          {/* 兩大獨立功能區塊切換（大字體、大按鈕） */}
          <div className="grid grid-cols-2 gap-2.5 rounded-2xl bg-stone-100 p-1.5 border border-stone-200">
            <button
              id="nav-tab-places"
              type="button"
              onClick={() => setActiveTab('places')}
              className={`flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-base sm:text-lg font-extrabold transition-all cursor-pointer ${
                activeTab === 'places'
                  ? 'bg-stone-900 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-white/60'
              }`}
            >
              <BookmarkCheck className="h-5 w-5 text-amber-400 shrink-0" />
              <span>1. 地點清單與分類 ({places.length})</span>
            </button>

            <button
              id="nav-tab-planner"
              type="button"
              onClick={() => setActiveTab('planner')}
              className={`flex items-center justify-center gap-2 rounded-xl py-3 px-4 text-base sm:text-lg font-extrabold transition-all cursor-pointer ${
                activeTab === 'planner'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-white/60'
              }`}
            >
              <Sparkles className="h-5 w-5 shrink-0" />
              <span>2. 順路排程（對話＋地圖）</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 py-5">
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
