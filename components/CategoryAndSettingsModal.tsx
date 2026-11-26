'use client';

import React, { useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Download,
  KeyRound,
  Layers,
  Plus,
  QrCode,
  RefreshCw,
  RotateCcw,
  Smartphone,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { usePlaces } from '@/context/PlacesContext';
import { CategoryConfig, SavedPlace } from '@/types/place';

interface CategoryAndSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'categories' | 'api_cloud';
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
  initialTab = 'categories',
}: CategoryAndSettingsModalProps) {
  const {
    places,
    categoryConfigs,
    settings,
    isSyncing,
    lastSyncMessage,
    lastSyncError,
    addCategoryConfig,
    updateCategoryConfig,
    deleteCategoryConfig,
    updateSettings,
    importSettingsCode,
    importPlacesFromJson,
    reclassifyStreetFoodFromMeals,
    syncWithSupabase,
    resetToDemoData,
  } = usePlaces();

  const [activeTab, setActiveTab] = useState<'categories' | 'api_cloud'>(
    initialTab
  );
  const [newPrimary, setNewPrimary] = useState('restaurant');
  const [newSubCode, setNewSubCode] = useState('');
  const [newSubLabel, setNewSubLabel] = useState('');
  const [newStayMins, setNewStayMins] = useState(60);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);
  const [syncFeedbackIsError, setSyncFeedbackIsError] = useState(false);
  const [streetFoodFeedback, setStreetFoodFeedback] = useState<string | null>(
    null
  );

  // Cross-device sync state
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [showImportBox, setShowImportBox] = useState(false);
  const [importCodeInput, setImportCodeInput] = useState('');
  const jsonFileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleAddSubCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubLabel.trim()) return;
    const primaryObj =
      PRIMARY_CATEGORY_OPTIONS.find((p) => p.key === newPrimary) ||
      PRIMARY_CATEGORY_OPTIONS[0];
    const generatedCode =
      newSubCode.trim() || `custom_${Date.now().toString(36).slice(-4)}`;

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

  const handleImportJsonBackup = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      let incomingPlaces: SavedPlace[] = [];
      let incomingCategories: CategoryConfig[] | undefined;

      if (Array.isArray(parsed)) {
        incomingPlaces = parsed as SavedPlace[];
      } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.places)) {
        incomingPlaces = parsed.places as SavedPlace[];
        if (Array.isArray(parsed.categoryConfigs)) {
          incomingCategories = parsed.categoryConfigs as CategoryConfig[];
        }
      }

      const importedCount = importPlacesFromJson(
        incomingPlaces,
        incomingCategories
      );
      if (importedCount > 0) {
        setSyncFeedbackIsError(false);
        setSyncFeedback(
          `✅ 成功匯入 ${importedCount} 筆 JSON 備份景點！（若已設定 Supabase 將於 1.5 秒後自動同步至雲端）`
        );
      } else {
        setSyncFeedbackIsError(true);
        setSyncFeedback(
          '❌ JSON 檔案中找不到有效的景點資料，請選擇先前匯出的備份檔。'
        );
      }
    } catch {
      setSyncFeedbackIsError(true);
      setSyncFeedback('❌ 無法解析 JSON 檔案，請確認檔案格式正確。');
    }
  };

  const generateSyncUrl = () => {
    const payload = {
      googleMapsApiKey: settings.googleMapsApiKey?.trim() || '',
      geminiApiKey: settings.geminiApiKey?.trim() || '',
      supabaseUrl: settings.supabaseUrl?.trim() || '',
      supabaseAnonKey: settings.supabaseAnonKey?.trim() || '',
    };
    const b64 = btoa(encodeURIComponent(JSON.stringify(payload)));
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/?sync_keys=${b64}`;
    }
    return `/?sync_keys=${b64}`;
  };

  const handleGenerateQr = async () => {
    try {
      const url = generateSyncUrl();
      const qrImage = await QRCode.toDataURL(url, {
        width: 300,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      });
      setQrDataUrl(qrImage);
      setShowQrModal(true);
    } catch (err) {
      console.error('Failed to generate QR code:', err);
    }
  };

  const handleCopySyncLink = async () => {
    try {
      const url = generateSyncUrl();
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setSyncFeedback('複製失敗，請手動複製網址。');
    }
  };

  const handleManualImport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!importCodeInput.trim()) return;
    const ok = importSettingsCode(importCodeInput.trim());
    if (ok) {
      setSyncFeedback('🎉 金鑰匯入成功！Google Maps 與 Gemini 已立即生效。');
      setImportCodeInput('');
      setShowImportBox(false);
    } else {
      setSyncFeedback('❌ 匯入代碼無效，請確認複製完整的同步連結或代碼。');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-stone-950/70 p-0 sm:p-4 backdrop-blur-xs">
      <div className="w-full sm:max-w-3xl rounded-t-3xl sm:rounded-3xl border border-stone-200 bg-white shadow-2xl overflow-hidden flex flex-col h-[94vh] sm:h-auto sm:max-h-[90vh]">
        {/* Header with Responsive, Evenly-Distributed Tabs */}
        <div className="flex items-center justify-between border-b border-stone-200 px-3 sm:px-6 py-3 sm:py-4 bg-stone-50 gap-2">
          <div className="grid grid-cols-2 gap-1.5 flex-1 max-w-xs sm:max-w-md">
            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-base font-black transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'categories'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-200/70'
              }`}
            >
              <Layers className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span>
                <span className="hidden sm:inline">彈性</span>分類
                <span className="hidden sm:inline">與停留時間</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('api_cloud')}
              className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-2 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-base font-black transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'api_cloud'
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'text-stone-600 hover:bg-stone-200/70'
              }`}
            >
              <KeyRound className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
              <span>
                <span className="hidden sm:inline">API</span>金鑰
                <span className="hidden sm:inline">・雲端備份</span>
              </span>
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-stone-500 hover:bg-stone-200 hover:text-stone-900 cursor-pointer shrink-0"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {activeTab === 'categories' ? (
            <>
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-4 text-sm sm:text-base text-stone-800 leading-relaxed space-y-3">
                <div>
                  <p className="font-black text-amber-950 text-base sm:text-lg mb-1">
                    💡 免改資料庫的彈性分類系統
                  </p>
                  <p className="text-stone-700">
                    您可以自由新增任何子分類（例如：「宵夜／酒吧」、「神社寺廟」、「不限時咖啡」）或調整預設停留分鐘數，「地點清單」與「現在想吃什麼」會立即同步！
                  </p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-amber-200/80">
                  <span className="text-xs sm:text-sm font-bold text-amber-900">
                    🥢 可免消耗 API 額度，直接將現有「正餐」中的牛肉湯、米糕、碗粿、麵攤等自動分流至「在地小吃」：
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const moved = reclassifyStreetFoodFromMeals();
                      setStreetFoodFeedback(
                        moved > 0
                          ? `✅ 已將 ${moved} 間店家從「正餐」歸類為「在地小吃」（並自動同步雲端）！`
                          : '✅ 目前「正餐」中已無待分流的在地小吃店家'
                      );
                    }}
                    className="rounded-xl bg-teal-600 px-3.5 py-2 text-xs sm:text-sm font-extrabold text-white hover:bg-teal-700 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    🥢 重新掃描分出「在地小吃」
                  </button>
                </div>
                {streetFoodFeedback && (
                  <p className="text-xs sm:text-sm font-extrabold text-teal-800">
                    {streetFoodFeedback}
                  </p>
                )}
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
                      className="w-full rounded-xl border-2 border-stone-300 bg-white px-3.5 py-2.5 text-sm sm:text-base font-bold text-stone-800 focus:border-amber-600 focus:outline-none"
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
                      顯示名稱（如：深夜居酒屋）
                    </label>
                    <input
                      type="text"
                      value={newSubLabel}
                      onChange={(e) => setNewSubLabel(e.target.value)}
                      placeholder="自訂標籤名稱"
                      className="w-full rounded-xl border-2 border-stone-300 bg-white px-3.5 py-2.5 text-sm sm:text-base font-bold text-stone-800 focus:border-amber-600 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm sm:text-base font-extrabold text-stone-700 mb-1.5">
                      英文代碼（選填）
                    </label>
                    <input
                      type="text"
                      value={newSubCode}
                      onChange={(e) => setNewSubCode(e.target.value)}
                      placeholder="例：izakaya"
                      className="w-full rounded-xl border-2 border-stone-300 bg-white px-3.5 py-2.5 text-sm sm:text-base font-bold text-stone-800 focus:border-amber-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-sm sm:text-base font-extrabold text-stone-700 mb-1.5">
                      預設停留時間
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={10}
                        max={480}
                        step={5}
                        value={newStayMins}
                        onChange={(e) => setNewStayMins(Number(e.target.value))}
                        className="w-24 rounded-xl border-2 border-stone-300 bg-white px-3.5 py-2.5 text-sm sm:text-base font-black text-stone-800 focus:border-amber-600 focus:outline-none text-center"
                      />
                      <span className="text-sm font-bold text-stone-600">
                        分鐘
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm sm:text-base font-black text-white hover:bg-amber-700 transition-colors cursor-pointer shadow-xs"
                  >
                    <Plus className="h-5 w-5" />
                    儲存並啟用子分類
                  </button>
                </div>
              </form>

              {/* Existing Categories List */}
              <div className="space-y-3">
                <h4 className="text-base sm:text-lg font-black text-stone-900">
                  📋 目前所有分類與停留設定（{categoryConfigs.length} 項）
                </h4>
                {categoryConfigs.map((cfg) => (
                  <div
                    key={cfg.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-stone-200 bg-white p-3.5 sm:p-4 hover:border-amber-300 transition-colors shadow-2xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="rounded-lg bg-stone-100 px-2 py-1 text-xs font-bold text-stone-600">
                        {cfg.primary_label}
                      </span>
                      <span className="text-base sm:text-lg font-black text-stone-900">
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
              {/* Device Isolation & Cross-Device Sync Explanation Banner */}
              <div className="rounded-2xl border-2 border-teal-300 bg-teal-50/80 p-4 sm:p-5 text-sm sm:text-base text-stone-800 leading-relaxed space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">🛡️</span>
                  <p className="font-black text-teal-950 text-base sm:text-lg">
                    瀏覽器本機儲存 ＋ 跨裝置秒同步
                  </p>
                </div>
                <p className="text-stone-700">
                  因瀏覽器安全性機制，<strong>電腦與手機 PWA 的資料庫各自獨立</strong>。
                  若您已在電腦版輸入好 Google Maps API Key，可直接使用下方的<strong>「📱 掃碼同步」</strong>功能，手機相機一照即可一秒帶入，無須手動重複打字！
                </p>
              </div>

              {/* Cross-device Quick Sync Action Card */}
              <div className="rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50/50 p-4 sm:p-5 text-stone-900 space-y-3 shadow-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-5 w-5 text-amber-700" />
                    <h4 className="text-base sm:text-lg font-black text-amber-950">
                      📱 跨裝置一秒同步（電腦 ➔ 手機 PWA）
                    </h4>
                  </div>
                </div>
                <p className="text-xs sm:text-sm text-stone-700">
                  在電腦填好下方金鑰後，點擊「產生 QR Code」，手機相機掃描即可將設定一鍵灌入手機 PWA！
                </p>

                <div className="flex flex-wrap items-center gap-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleGenerateQr}
                    className="inline-flex items-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-500 px-4 py-2.5 text-sm sm:text-base font-black text-white cursor-pointer shadow-xs transition-colors"
                  >
                    <QrCode className="h-4 w-4" />
                    產生 QR Code 讓手機掃描
                  </button>

                  <button
                    type="button"
                    onClick={handleCopySyncLink}
                    className="inline-flex items-center gap-1.5 rounded-xl border-2 border-amber-300 bg-white hover:bg-amber-100/60 px-3.5 py-2.5 text-xs sm:text-sm font-extrabold text-stone-800 cursor-pointer shadow-2xs transition-colors"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 text-emerald-600" />
                        <span className="text-emerald-700">已複製同步連結！</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 text-stone-600" />
                        複製同步連結
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowImportBox(!showImportBox)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white hover:bg-stone-100 px-3 py-2 text-xs sm:text-sm font-bold text-stone-700 cursor-pointer"
                  >
                    📥 貼上代碼手動匯入
                  </button>
                </div>

                {/* Manual Import Box (Collapsible) */}
                {showImportBox && (
                  <form
                    onSubmit={handleManualImport}
                    className="mt-3 pt-3 border-t border-amber-200/80 space-y-2"
                  >
                    <label className="block text-xs sm:text-sm font-extrabold text-stone-800">
                      貼上從電腦複製的同步代碼或網址：
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={importCodeInput}
                        onChange={(e) => setImportCodeInput(e.target.value)}
                        placeholder="貼上同步網址或代碼..."
                        className="flex-1 rounded-xl border-2 border-stone-300 bg-white px-3 py-2 text-xs sm:text-sm font-mono text-stone-800 focus:outline-none focus:border-amber-600"
                      />
                      <button
                        type="submit"
                        disabled={!importCodeInput.trim()}
                        className="rounded-xl bg-amber-700 px-4 py-2 text-xs sm:text-sm font-black text-white hover:bg-amber-800 disabled:opacity-50 cursor-pointer whitespace-nowrap"
                      >
                        立即匯入
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* API Key Inputs */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm sm:text-base font-extrabold text-stone-800">
                      Google Maps API Key (Places & Routes)
                    </label>
                    {settings.googleMapsApiKey && (
                      <span className="text-xs font-bold text-emerald-600">
                        ✓ 已設定
                      </span>
                    )}
                  </div>
                  <input
                    type="password"
                    value={settings.googleMapsApiKey}
                    onChange={(e) =>
                      updateSettings({ googleMapsApiKey: e.target.value })
                    }
                    placeholder="AIzaSy..."
                    className="w-full rounded-xl border-2 border-stone-300 px-3.5 py-2.5 text-base sm:text-lg font-mono font-bold text-stone-800 focus:border-amber-600 focus:outline-none"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-sm sm:text-base font-extrabold text-stone-800">
                      Gemini API Key (AI 自動分類與意圖解析)
                    </label>
                    {settings.geminiApiKey && (
                      <span className="text-xs font-bold text-emerald-600">
                        ✓ 已設定
                      </span>
                    )}
                  </div>
                  <input
                    type="password"
                    value={settings.geminiApiKey}
                    onChange={(e) =>
                      updateSettings({ geminiApiKey: e.target.value })
                    }
                    placeholder="AIzaSy..."
                    className="w-full rounded-xl border-2 border-stone-300 px-3.5 py-2.5 text-base sm:text-lg font-mono font-bold text-stone-800 focus:border-amber-600 focus:outline-none"
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

              {(syncFeedback || lastSyncError || lastSyncMessage) && (
                <div
                  className={`rounded-xl border p-3.5 text-sm sm:text-base font-bold ${
                    (syncFeedback ? syncFeedbackIsError : Boolean(lastSyncError))
                      ? 'bg-red-50 border-red-200 text-red-800'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {syncFeedback || lastSyncError || lastSyncMessage}
                </div>
              )}

              {/* Bottom Actions */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-stone-200">
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    id="btn-modal-bidirectional-sync"
                    type="button"
                    disabled={isSyncing}
                    onClick={async () => {
                      const res = await syncWithSupabase();
                      setSyncFeedbackIsError(!res.ok);
                      setSyncFeedback(res.message);
                    }}
                    className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-base sm:text-lg font-black text-white hover:bg-teal-800 disabled:opacity-50 cursor-pointer shadow-xs"
                  >
                    <RefreshCw
                      className={`h-5 w-5 ${isSyncing ? 'animate-spin' : ''}`}
                    />
                    {isSyncing
                      ? '雙向同步中...'
                      : '立即雙向同步（手機 ↔ 電腦）'}
                  </button>

                  <button
                    type="button"
                    onClick={handleExportJsonBackup}
                    className="inline-flex items-center gap-2 rounded-xl border-2 border-stone-300 bg-white px-4 py-3 text-base sm:text-lg font-black text-stone-800 hover:bg-stone-50 cursor-pointer shadow-xs"
                  >
                    <Download className="h-5 w-5 text-amber-700" />
                    匯出完整 JSON 備份 ({places.length} 筆)
                  </button>

                  <input
                    ref={jsonFileInputRef}
                    type="file"
                    accept=".json,application/json"
                    onChange={handleImportJsonBackup}
                    className="hidden"
                  />
                  <button
                    id="btn-import-json-backup"
                    type="button"
                    onClick={() => jsonFileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-xl border-2 border-amber-300 bg-amber-50/70 px-4 py-3 text-base sm:text-lg font-black text-amber-950 hover:bg-amber-100 cursor-pointer shadow-xs"
                  >
                    <Upload className="h-5 w-5 text-amber-700" />
                    匯入 JSON 備份
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    resetToDemoData();
                    setSyncFeedbackIsError(false);
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

      {/* QR Code Sync Popover / Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-3xl border border-stone-700 bg-stone-900 p-6 text-stone-100 shadow-2xl text-center space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-left">
                <Smartphone className="h-6 w-6 text-amber-400" />
                <h3 className="text-base sm:text-lg font-black text-white">
                  手機掃碼一秒同步金鑰
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="text-stone-400 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-stone-300 leading-relaxed text-left">
              請用手機相機（或 LINE 行動條碼掃描器）對準螢幕掃描下方 QR Code，點擊連結開啟後即可自動將金鑰存入手機 PWA！
            </p>

            <div className="bg-white p-4 rounded-2xl inline-block shadow-inner">
              {qrDataUrl && (
                <img
                  src={qrDataUrl}
                  alt="Sync QR Code"
                  className="w-56 h-56 mx-auto block"
                />
              )}
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={handleCopySyncLink}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 py-2.5 px-4 text-stone-950 font-black text-sm cursor-pointer shadow-xs transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-900" />
                    已複製同步網址！
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" />
                    複製此同步網址
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="w-full py-2 text-xs font-bold text-stone-400 hover:text-white cursor-pointer"
              >
                完成並關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
