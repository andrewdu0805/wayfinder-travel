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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-4 backdrop-blur-xs">
      <div className="w-full max-w-2xl rounded-2xl border border-stone-200 bg-white shadow-xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-200 px-5 py-4 bg-stone-50">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'categories'
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-600 hover:bg-stone-200/70'
              }`}
            >
              <Layers className="h-4 w-4" />
              彈性分類與停留時間管理
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('api_cloud')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                activeTab === 'api_cloud'
                  ? 'bg-stone-900 text-white'
                  : 'text-stone-600 hover:bg-stone-200/70'
              }`}
            >
              <KeyRound className="h-4 w-4" />
              API 金鑰・雲端同步・備份
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-200/60 hover:text-stone-800 cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'categories' ? (
            <>
              <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-3.5 text-xs text-stone-700">
                <p className="font-semibold text-stone-900">
                  💡 免改 SQL 的彈性分類系統
                </p>
                <p className="mt-0.5 text-stone-600">
                  我們已移除死板的資料庫 <code>ENUM</code>。您可以直接在下方新增任何子分類（例如：「宵夜／酒吧」、「神社寺廟」、「不限時咖啡廳」）或調整預設停留分鐘數，所有卡片與智慧排程積木會立即同步更新！
                </p>
              </div>

              {/* Add New Category Form */}
              <form
                onSubmit={handleAddSubCategory}
                className="rounded-xl border border-stone-200 bg-stone-50 p-3.5 space-y-3"
              >
                <h4 className="text-xs font-bold text-stone-800">
                  ＋ 新增自訂子分類
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                  <div>
                    <label className="block text-[11px] text-stone-500 mb-1">
                      歸屬主分類
                    </label>
                    <select
                      value={newPrimary}
                      onChange={(e) => setNewPrimary(e.target.value)}
                      className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-800"
                    >
                      {PRIMARY_CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.key} value={opt.key}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-stone-500 mb-1">
                      子分類顯示名稱
                    </label>
                    <input
                      type="text"
                      required
                      value={newSubLabel}
                      onChange={(e) => setNewSubLabel(e.target.value)}
                      placeholder="例：宵夜／居酒屋"
                      className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-stone-500 mb-1">
                      代號 (選填)
                    </label>
                    <input
                      type="text"
                      value={newSubCode}
                      onChange={(e) => setNewSubCode(e.target.value)}
                      placeholder="例：night_bar"
                      className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-stone-500 mb-1">
                      預設停留 (分鐘)
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={10}
                        max={480}
                        step={5}
                        value={newStayMins}
                        onChange={(e) => setNewStayMins(Number(e.target.value))}
                        className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-800"
                      />
                      <button
                        type="submit"
                        className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-stone-800 shrink-0 cursor-pointer"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        新增
                      </button>
                    </div>
                  </div>
                </div>
              </form>

              {/* Existing Categories Table */}
              <div className="space-y-2">
                {categoryConfigs.map((cfg) => (
                  <div
                    key={cfg.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-stone-100 px-2 py-0.5 font-medium text-stone-600">
                        {cfg.primary_label}
                      </span>
                      <span className="font-bold text-stone-900 text-sm">
                        {cfg.sub_label}
                      </span>
                      <code className="text-[11px] text-stone-400">
                        ({cfg.sub_category})
                      </code>
                    </div>

                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-stone-600">
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
                          className="w-16 rounded border border-stone-300 px-2 py-0.5 text-center font-semibold text-stone-900"
                        />
                        分鐘
                      </label>
                      {categoryConfigs.length > 3 && (
                        <button
                          type="button"
                          onClick={() => deleteCategoryConfig(cfg.id)}
                          className="text-stone-400 hover:text-red-600 p-1 cursor-pointer"
                          title="刪除此子分類"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3.5 text-xs text-stone-700">
                <p className="font-semibold text-teal-950">
                  🛡️ 本機自動持久化 ＋ 雲端 Supabase 雙引擎
                </p>
                <p className="mt-0.5 text-stone-600">
                  目前所有新增與修改均已自動儲存在您的瀏覽器本機。若您填入下方 API Key 與 Supabase 連線資訊，即可啟用真實 Google Places 即時查詢與跨裝置雲端同步。
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Google Maps API Key (Places & Routes)
                  </label>
                  <input
                    type="password"
                    value={settings.googleMapsApiKey}
                    onChange={(e) =>
                      updateSettings({ googleMapsApiKey: e.target.value })
                    }
                    placeholder="AIzaSy..."
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Gemini API Key (AI 自動分類與意圖解析)
                  </label>
                  <input
                    type="password"
                    value={settings.geminiApiKey}
                    onChange={(e) =>
                      updateSettings({ geminiApiKey: e.target.value })
                    }
                    placeholder="AIzaSy..."
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Supabase Project URL
                  </label>
                  <input
                    type="text"
                    value={settings.supabaseUrl}
                    onChange={(e) =>
                      updateSettings({ supabaseUrl: e.target.value })
                    }
                    placeholder="https://xyz.supabase.co"
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-stone-700 mb-1">
                    Supabase Anon / Service Key
                  </label>
                  <input
                    type="password"
                    value={settings.supabaseAnonKey}
                    onChange={(e) =>
                      updateSettings({ supabaseAnonKey: e.target.value })
                    }
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5..."
                    className="w-full rounded-lg border border-stone-300 px-3 py-2 text-stone-800"
                  />
                </div>
              </div>

              {(syncFeedback || lastSyncMessage) && (
                <div className="rounded-lg bg-stone-100 px-3 py-2 text-xs font-medium text-stone-800">
                  {syncFeedback || lastSyncMessage}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-stone-200">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={isSyncing}
                    onClick={async () => {
                      const res = await syncWithSupabase();
                      setSyncFeedback(res.message);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
                  >
                    <CloudUpload className="h-4 w-4" />
                    一鍵同步至 Supabase 雲端
                  </button>

                  <button
                    type="button"
                    onClick={handleExportJsonBackup}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
                  >
                    <Download className="h-4 w-4 text-amber-700" />
                    匯出完整 JSON 備份 ({places.length} 筆)
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    resetToDemoData();
                    setSyncFeedback('已重置為內建台灣＋日本熱門城市預設資料！');
                  }}
                  className="inline-flex items-center gap-1 rounded-xl border border-stone-200 px-3 py-2 text-xs text-stone-500 hover:bg-stone-100 hover:text-stone-800 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
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
