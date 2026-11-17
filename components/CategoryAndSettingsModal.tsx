'use client';

import React, { useState } from 'react';
import {
  CloudUpload,
  Download,
  KeyRound,
  Layers,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { usePlaces } from '@/context/PlacesContext';

interface CategoryAndSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRIMARY_CATEGORY_OPTIONS = [
  { key: 'restaurant', label: '餐廳與飲食' },
  { key: 'museum_culture', label: '展館與文化' },
  { key: 'theme_park_leisure', label: '遊樂園與休閒' },
  { key: 'nature_outdoor', label: '自然與戶外' },
  { key: 'shopping', label: '購物與市集' },
];

export function CategoryAndSettingsModal({
  isOpen,
  onClose,
}: CategoryAndSettingsModalProps) {
  const {
    places,
    categoryConfigs,
    settings,
    isSyncing,
    lastSyncMessage,
    addCategoryConfig,
    updateCategoryConfig,
    deleteCategoryConfig,
    updateSettings,
    syncWithSupabase,
    resetToDemoData,
  } = usePlaces();

  const [activeTab, setActiveTab] = useState<'categories' | 'api_cloud'>(
    'categories'
  );
  const [newPrimary, setNewPrimary] = useState('restaurant');
  const [newSubCode, setNewSubCode] = useState('');
  const [newSubLabel, setNewSubLabel] = useState('');
  const [newStayMins, setNewStayMins] = useState(60);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddSubCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubLabel.trim()) return;
    const primaryObj =
      PRIMARY_CATEGORY_OPTIONS.find((p) => p.key === newPrimary) ||
      PRIMARY_CATEGORY_OPTIONS[0];
    const generatedCode =
      newSubCode.trim() ||
      `custom_${Date.now().toString(36).slice(-4)}`;

    addCategoryConfig({
      primary_category: primaryObj.key,
      primary_label: primaryObj.label,
      sub_category: generatedCode,
      sub_label: newSubLabel.trim(),
      default_stay_mins: Number(newStayMins) || 60,
      icon_name: 'Sparkles',
    });

    setNewSubCode('');
    setNewSubLabel('');
    setNewStayMins(60);
  };

  const handleExportJsonBackup = () => {
    const blob = new Blob([JSON.stringify(places, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `antigravity_places_backup_${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-950/70 p-0 sm:p-4 backdrop-blur-sm">
      <div className="w-full sm:max-w-3xl rounded-t-3xl sm:rounded-3xl border border-stone-200 bg-white shadow-2xl overflow-hidden flex flex-col h-[94vh] sm:h-auto sm:max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 px-4 sm:px-6 py-3.5 sm:py-4 bg-stone-50">
          <div className="flex items-center gap-2 overflow-x-auto py-1">
            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base font-black transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'categories'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-200/70'
              }`}
            >
              <Layers className="h-5 w-5" />
              彈性分類與停留時間
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('api_cloud')}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 sm:px-4 py-2 sm:py-2.5 text-sm sm:text-base font-black transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'api_cloud'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-200/70'
              }`}
            >
              <KeyRound className="h-5 w-5" />
              API金鑰・雲端備份
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-stone-500 hover:bg-stone-200 hover:text-stone-900 cursor-pointer"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'categories' ? (
            <>
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-4 text-sm sm:text-base text-stone-800 leading-relaxed">
                <p className="font-black text-amber-950 text-base sm:text-lg mb-1">
                  💡 免改資料庫的彈性分類系統
                </p>
                <p className="text-stone-700">
                  您可以自由新增任何子分類（例如：「宵夜／酒吧」、「神社寺廟」、「不限時咖啡」）或調整預設停留分鐘數，所有地點卡片與排程會立即同步！
                </p>
              </div>

              {/* Add New Category Form */}
              <form
                onSubmit={handleAddSubCategory}
                className="rounded-2xl border-2 border-stone-200 bg-stone-50 p-4 sm:p-5 space-y-4"
              >
                <h4 className="text-base sm:text-lg font-black text-stone-900">
                  ➕ 新增自訂子分類
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-sm sm:text-base font-extrabold text-stone-700 mb-1.5">
                      歸屬主分類
                    </label>
                    <select
                      value={newPrimary}
                      onChange={(e) => setNewPrimary(e.target.value)}
                      className="w-full rounded-xl border-2 border-stone-300 bg-white px-3.5 py-2.5 text-base sm:text-lg font-bold text-stone-800 focus:border-amber-600 focus:outline-none"
                    >
                      {PRIMARY_CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.key} value={opt.key}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm sm:text-base font-extrabold text-stone-700 mb-1.5">
                      子分類名稱
                    </label>
                    <input
                      type="text"
                      required
                      value={newSubLabel}
                      onChange={(e) => setNewSubLabel(e.target.value)}
                      placeholder="例：宵夜／居酒屋"
                      className="w-full rounded-xl border-2 border-stone-300 bg-white px-3.5 py-2.5 text-base sm:text-lg font-bold text-stone-800 focus:border-amber-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm sm:text-base font-extrabold text-stone-700 mb-1.5">
                      代號（選填）
                    </label>
                    <input
                      type="text"
                      value={newSubCode}
                      onChange={(e) => setNewSubCode(e.target.value)}
                      placeholder="例：night_bar"
                      className="w-full rounded-xl border-2 border-stone-300 bg-white px-3.5 py-2.5 text-base sm:text-lg font-bold text-stone-800 focus:border-amber-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm sm:text-base font-extrabold text-stone-700 mb-1.5">
                      預設停留（分）
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={10}
                        max={480}
                        step={5}
                        value={newStayMins}
                        onChange={(e) => setNewStayMins(Number(e.target.value))}
                        className="w-full rounded-xl border-2 border-stone-300 bg-white px-3 py-2.5 text-base sm:text-lg font-black text-stone-800 focus:border-amber-600 focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2.5 text-base sm:text-lg font-black text-white hover:bg-stone-800 shrink-0 cursor-pointer shadow-xs"
                      >
                        <Plus className="h-5 w-5" />
                        新增
                      </button>
                    </div>
                  </div>
                </div>
              </form>

              {/* Existing Categories Table */}
              <div className="space-y-3">
                <h4 className="text-base sm:text-lg font-black text-stone-900">
                  📋 目前現有分類清單
                </h4>
                {categoryConfigs.map((cfg) => (
                  <div
                    key={cfg.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-stone-200 bg-white p-3.5 sm:p-4 text-base"
                  >
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="rounded-lg bg-stone-100 px-2.5 py-1 text-sm font-extrabold text-stone-600">
                        {cfg.primary_label}
                      </span>
                      <span className="font-black text-stone-900 text-base sm:text-lg">
                        {cfg.sub_label}
                      </span>
                      <code className="text-xs text-stone-400">
                        ({cfg.sub_category})
                      </code>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-2 text-stone-700 text-sm sm:text-base font-extrabold">
                        預設停留：
                        <input
                          type="number"
                          min={10}
                          max={480}
                          step={5}
                          value={cfg.default_stay_mins}
                          onChange={(e) =>
                            updateCategoryConfig(cfg.id, {
                              default_stay_mins: Number(e.target.value) || 60,
                            })
                          }
                          className="w-20 rounded-xl border-2 border-stone-300 px-2.5 py-1.5 text-center font-black text-base sm:text-lg text-stone-900 focus:border-amber-600 focus:outline-none"
                        />
                        分鐘
                      </label>
                      {categoryConfigs.length > 3 && (
                        <button
                          type="button"
                          onClick={() => deleteCategoryConfig(cfg.id)}
                          className="text-stone-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-xl cursor-pointer transition-colors"
                          title="刪除此子分類"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border-2 border-teal-300 bg-teal-50/70 p-4 text-sm sm:text-base text-stone-800 leading-relaxed">
                <p className="font-black text-teal-950 text-base sm:text-lg mb-1">
                  🛡️ 本機自動儲存 ＋ 雲端 Supabase 跨裝置同步
                </p>
                <p className="text-stone-700">
                  目前所有新增與修改均已自動儲存在您的手機瀏覽器本機。若您填入下方 API Key 與 Supabase 連線資訊，即可啟用真實 Google Places 即時查詢與跨裝置雲端同步。
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm sm:text-base font-extrabold text-stone-800 mb-1.5">
                    Google Maps API Key (Places & Routes)
                  </label>
                  <input
                    type="password"
                    value={settings.googleMapsApiKey}
                    onChange={(e) =>
                      updateSettings({ googleMapsApiKey: e.target.value })
                    }
                    placeholder="AIzaSy..."
                    className="w-full rounded-xl border-2 border-stone-300 px-3.5 py-2.5 text-base sm:text-lg font-bold text-stone-800 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm sm:text-base font-extrabold text-stone-800 mb-1.5">
                    Gemini API Key (AI 自動分類與意圖解析)
                  </label>
                  <input
                    type="password"
                    value={settings.geminiApiKey}
                    onChange={(e) =>
                      updateSettings({ geminiApiKey: e.target.value })
                    }
                    placeholder="AIzaSy..."
                    className="w-full rounded-xl border-2 border-stone-300 px-3.5 py-2.5 text-base sm:text-lg font-bold text-stone-800 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm sm:text-base font-extrabold text-stone-800 mb-1.5">
                    Supabase Project URL
                  </label>
                  <input
                    type="text"
                    value={settings.supabaseUrl}
                    onChange={(e) =>
                      updateSettings({ supabaseUrl: e.target.value })
                    }
                    placeholder="https://xyz.supabase.co"
                    className="w-full rounded-xl border-2 border-stone-300 px-3.5 py-2.5 text-base sm:text-lg font-bold text-stone-800 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm sm:text-base font-extrabold text-stone-800 mb-1.5">
                    Supabase Anon / Service Key
                  </label>
                  <input
                    type="password"
                    value={settings.supabaseAnonKey}
                    onChange={(e) =>
                      updateSettings({ supabaseAnonKey: e.target.value })
                    }
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5..."
                    className="w-full rounded-xl border-2 border-stone-300 px-3.5 py-2.5 text-base sm:text-lg font-bold text-stone-800 focus:border-amber-600 focus:outline-none"
                  />
                </div>
              </div>

              {(syncFeedback || lastSyncMessage) && (
                <div className="rounded-xl bg-stone-100 p-3.5 text-sm sm:text-base font-bold text-stone-800">
                  {syncFeedback || lastSyncMessage}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-stone-200">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={isSyncing}
                    onClick={async () => {
                      const res = await syncWithSupabase();
                      setSyncFeedback(res.message);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-base sm:text-lg font-black text-white hover:bg-teal-800 disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <CloudUpload className="h-5 w-5" />
                    一鍵同步至 Supabase 雲端
                  </button>

                  <button
                    type="button"
                    onClick={handleExportJsonBackup}
                    className="inline-flex items-center gap-2 rounded-xl border-2 border-stone-300 bg-white px-4 py-3 text-base sm:text-lg font-black text-stone-800 hover:bg-stone-50 cursor-pointer shadow-xs"
                  >
                    <Download className="h-5 w-5 text-amber-700" />
                    匯出完整 JSON 備份 ({places.length} 筆)
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    resetToDemoData();
                    setSyncFeedback('已重置為內建台灣＋日本熱門城市預設資料！');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-stone-200 px-3.5 py-2.5 text-sm sm:text-base font-bold text-stone-500 hover:bg-stone-100 hover:text-stone-800 cursor-pointer"
                >
                  <RotateCcw className="h-4 w-4" />
                  還原預設範例資料
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
