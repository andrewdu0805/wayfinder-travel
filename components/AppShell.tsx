'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  BookmarkCheck,
  Cloud,
  Compass,
  RefreshCw,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { usePlaces } from '@/context/PlacesContext';
import { PlacesManagerView } from './PlacesManagerView';
import { ItineraryPlannerView } from './ItineraryPlannerView';
import { CategoryAndSettingsModal } from './CategoryAndSettingsModal';

interface AppShellProps {
  initialTab?: 'places' | 'planner';
}

export function AppShell({ initialTab = 'places' }: AppShellProps) {
  const {
    places,
    settings,
    isSyncing,
    isSupabaseConfigured,
    lastSyncError,
    clearSyncFeedback,
    syncWithSupabase,
    smartUpsertPlaces,
  } = usePlaces();
  const [activeTab, setActiveTab] = useState<'places' | 'planner'>(initialTab);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<
    'categories' | 'api_cloud'
  >('categories');
  const [manualSyncToast, setManualSyncToast] = useState<string | null>(null);

  const openSettings = (tab: 'categories' | 'api_cloud' = 'categories') => {
    setSettingsInitialTab(tab);
    setIsSettingsOpen(true);
  };

  const handleHeaderCloudSync = async () => {
    if (!isSupabaseConfigured) {
      openSettings('api_cloud');
      return;
    }
    setManualSyncToast(null);
    const res = await syncWithSupabase();
    if (res.ok) {
      setManualSyncToast(res.message);
      setTimeout(() => {
        setManualSyncToast((prev) => (prev === res.message ? null : prev));
      }, 4500);
    }
  };

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
      {/* Top Navigation Header — High space efficiency on mobile, Clean Large Font */}
      <header className="sticky top-0 z-30 border-b border-stone-200 bg-white/95 backdrop-blur-md shadow-xs">
        <div className="mx-auto max-w-6xl px-3 sm:px-6 py-2 sm:py-3 space-y-2 sm:space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <div className="flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl sm:rounded-2xl bg-stone-900 text-amber-400 shadow-xs shrink-0">
                <Compass className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base sm:text-2xl font-black tracking-tight text-stone-900 leading-tight whitespace-nowrap truncate">
                  Wayfinder 順路導航
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                id="btn-header-cloud-sync"
                type="button"
                disabled={isSyncing}
                onClick={handleHeaderCloudSync}
                title={
                  isSupabaseConfigured
                    ? '立即執行手機 ↔ 電腦 Supabase 雙向同步'
                    : '前往設定 Supabase 雲端雙向同步'
                }
                className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1 sm:gap-1.5 rounded-xl border px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-extrabold transition-colors cursor-pointer disabled:opacity-60 ${
                  lastSyncError
                    ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                    : isSupabaseConfigured
                    ? 'border-teal-300 bg-teal-50 text-teal-800 hover:bg-teal-100'
                    : 'border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100'
                }`}
              >
                {isSyncing ? (
                  <RefreshCw className="h-4 w-4 animate-spin shrink-0" />
                ) : isSupabaseConfigured ? (
                  <RefreshCw className="h-4 w-4 shrink-0" />
                ) : (
                  <Cloud className="h-4 w-4 shrink-0" />
                )}
                <span className="whitespace-nowrap">
                  {isSyncing
                    ? '同步中...'
                    : isSupabaseConfigured
                    ? '雙向同步'
                    : '雲端同步'}
                </span>
              </button>

              <button
                id="btn-header-settings"
                type="button"
                onClick={() => openSettings('categories')}
                className="shrink-0 whitespace-nowrap inline-flex items-center gap-1 sm:gap-1.5 rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-base font-extrabold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
              >
                <Settings className="h-4 w-4 sm:h-5 sm:w-5 text-stone-600 shrink-0" />
                <span className="whitespace-nowrap">分類設定</span>
              </button>
            </div>
          </div>

          {/* 兩大獨立功能區塊切換（精簡高度、防折行、好按大字） */}
          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-stone-100 p-1 border border-stone-200">
            <button
              id="nav-tab-places"
              type="button"
              onClick={() => setActiveTab('places')}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 sm:py-2.5 px-2 text-sm sm:text-base font-black transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'places'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-white/60'
              }`}
            >
              <BookmarkCheck className="h-4 w-4 text-amber-400 shrink-0" />
              <span>1. 地點清單 ({places.length})</span>
            </button>

            <button
              id="nav-tab-planner"
              type="button"
              onClick={() => setActiveTab('planner')}
              className={`flex items-center justify-center gap-1.5 rounded-lg py-2 sm:py-2.5 px-2 text-sm sm:text-base font-black transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'planner'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-white/60'
              }`}
            >
              <Sparkles className="h-4 w-4 shrink-0" />
              <span>2. 順路排程</span>
            </button>
          </div>
        </div>
      </header>

      {/* Supabase Sync Error Banner — Always visible when sync fails */}
      {lastSyncError && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-red-900">
          <div className="mx-auto max-w-6xl flex items-center justify-between gap-3 text-xs sm:text-sm font-bold">
            <div className="flex items-center gap-2 min-w-0">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
              <span className="break-words">{lastSyncError}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={isSyncing}
                onClick={handleHeaderCloudSync}
                className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-extrabold text-white hover:bg-red-700 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                重試
              </button>
              <button
                type="button"
                onClick={clearSyncFeedback}
                className="rounded-lg p-1 text-red-600 hover:bg-red-100 cursor-pointer"
                title="關閉提示"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Brief Manual Sync Success Toast */}
      {!lastSyncError && manualSyncToast && (
        <div className="border-b border-teal-200 bg-teal-50 px-4 py-2 text-teal-900">
          <div className="mx-auto max-w-6xl flex items-center justify-between gap-2 text-xs sm:text-sm font-bold">
            <span>{manualSyncToast}</span>
            <button
              type="button"
              onClick={() => setManualSyncToast(null)}
              className="rounded-lg p-1 text-teal-700 hover:bg-teal-100 cursor-pointer shrink-0"
              title="關閉提示"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6 py-5">
        {activeTab === 'places' ? (
          <PlacesManagerView
            onOpenSettingsModal={() => openSettings('categories')}
          />
        ) : (
          <ItineraryPlannerView />
        )}
      </main>

      {/* Settings & Flexible Category Modal */}
      <CategoryAndSettingsModal
        key={`${isSettingsOpen ? 'open' : 'closed'}-${settingsInitialTab}`}
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialTab={settingsInitialTab}
      />
    </div>
  );
}
