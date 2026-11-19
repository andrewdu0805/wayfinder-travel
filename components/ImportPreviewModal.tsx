'use client';

import React, { useState, useMemo } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  FileSpreadsheet,
  HelpCircle,
  MapPin,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { SavedPlace, CategoryConfig } from '@/types/place';
import {
  ALL_TAIWAN_CITY_DISTRICTS,
  ALL_TAIWAN_CITIES,
  getCoordinatesForRegion,
} from '@/lib/geo-utils';
import { resolvePlaceDescription } from '@/lib/place-notes';

export function exportExcelCompatibleCsv(
  placesToExport: SavedPlace[],
  filename = 'Wayfinder_整理完成地點.csv'
) {
  // UTF-8 BOM (\uFEFF) instructs Microsoft Excel on Windows to interpret the file as UTF-8 rather than Big5/ANSI
  const BOM = '\uFEFF';
  const headers = [
    '店名',
    '縣市',
    '行政區',
    '主分類',
    '次分類',
    '完整地址',
    '備註說明',
    'Google地圖連結',
  ];
  const rows = placesToExport.map((p) => {
    return [
      `"${(p.name || '').replace(/"/g, '""')}"`,
      `"${(p.city || '').replace(/"/g, '""')}"`,
      `"${(p.district || '').replace(/"/g, '""')}"`,
      `"${(p.primary_category || '').replace(/"/g, '""')}"`,
      `"${(p.sub_category || '').replace(/"/g, '""')}"`,
      `"${(p.formatted_address || '').replace(/"/g, '""')}"`,
      `"${(p.user_notes || '').replace(/"/g, '""')}"`,
      `"${(p.google_maps_url || '').replace(/"/g, '""')}"`,
    ].join(',');
  });

  const csvContent = BOM + [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface ImportPreviewModalProps {
  initialPlaces: SavedPlace[];
  categoryConfigs: CategoryConfig[];
  onConfirmImport: (selectedPlaces: SavedPlace[]) => void;
  onClose: () => void;
}

export function ImportPreviewModal({
  initialPlaces,
  categoryConfigs,
  onConfirmImport,
  onClose,
}: ImportPreviewModalProps) {
  const [places, setPlaces] = useState<SavedPlace[]>(initialPlaces);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialPlaces.map((p) => p.id))
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCity, setFilterCity] = useState('ALL');
  const [filterCat, setFilterCat] = useState('ALL');
  const [showEncodingHelp, setShowEncodingHelp] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  // Extract unique cities
  const availableCities = useMemo(() => {
    const set = new Set<string>();
    for (const p of places) {
      if (p.city) set.add(p.city);
    }
    return Array.from(set).sort();
  }, [places]);

  // Filtered places according to search & dropdowns
  const filteredPlaces = useMemo(() => {
    return places.filter((p) => {
      if (filterCity !== 'ALL' && p.city !== filterCity) return false;
      if (filterCat !== 'ALL' && p.sub_category !== filterCat) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchName = p.name.toLowerCase().includes(q);
        const matchAddr = (p.formatted_address || '').toLowerCase().includes(q);
        const matchDist = (p.district || '').toLowerCase().includes(q);
        const matchNotes = (p.user_notes || '').toLowerCase().includes(q);
        if (!matchName && !matchAddr && !matchDist && !matchNotes) return false;
      }
      return true;
    });
  }, [places, filterCity, filterCat, searchQuery]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const p of filteredPlaces) {
        next.add(p.id);
      }
      return next;
    });
  };

  const deselectAllFiltered = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const p of filteredPlaces) {
        next.delete(p.id);
      }
      return next;
    });
  };

  const deletePlace = (id: string) => {
    setPlaces((prev) => prev.filter((p) => p.id !== id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const startEditName = (p: SavedPlace) => {
    setEditingId(p.id);
    setEditName(p.name);
  };

  const saveEditName = (id: string) => {
    if (editName.trim()) {
      setPlaces((prev) =>
        prev.map((p) => (p.id === id ? { ...p, name: editName.trim() } : p))
      );
    }
    setEditingId(null);
  };

  const updatePlaceCityAndDistrict = (
    id: string,
    newCity: string,
    newDistrict: string
  ) => {
    setPlaces((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const newCoords = getCoordinatesForRegion(newCity, newDistrict, p.name);
        const freshNotes = resolvePlaceDescription(
          p.name,
          newCity,
          newDistrict,
          p.sub_category,
          p.formatted_address
        );
        let nextAddr = p.formatted_address || '';
        if (!nextAddr || !/[0-9]+號/.test(nextAddr)) {
          nextAddr = `台灣${newCity}${newDistrict}`;
        }
        return {
          ...p,
          city: newCity,
          district: newDistrict,
          latitude: newCoords.lat,
          longitude: newCoords.lng,
          formatted_address: nextAddr,
          user_notes:
            p.user_notes &&
            p.user_notes !== '由 CSV 清單匯入' &&
            p.user_notes !== '由 Google Takeout 匯入' &&
            !p.user_notes.includes('Google Maps 在地')
              ? p.user_notes
              : freshNotes,
        };
      })
    );
  };

  const updatePlaceCategory = (id: string, subCategory: string) => {
    const cfg = categoryConfigs.find((c) => c.sub_category === subCategory);
    if (!cfg) return;
    setPlaces((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        return {
          ...p,
          primary_category: cfg.primary_category,
          sub_category: cfg.sub_category,
          estimated_stay_mins: cfg.default_stay_mins,
        };
      })
    );
  };

  const handleExportCsv = () => {
    const selectedList = places.filter((p) => selectedIds.has(p.id));
    exportExcelCompatibleCsv(
      selectedList.length > 0 ? selectedList : places,
      `Wayfinder_整理完成地點_${places.length}筆.csv`
    );
  };

  const handleFinalConfirm = () => {
    const toImport = places.filter((p) => selectedIds.has(p.id));
    if (toImport.length === 0) {
      alert('請至少勾選 1 個要匯入的地點');
      return;
    }
    onConfirmImport(toImport);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-stone-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="flex flex-col w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl sm:rounded-3xl shadow-2xl border border-stone-200 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between gap-3 bg-stone-50/80">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/15 text-amber-700 shrink-0">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-base sm:text-lg font-black text-stone-900">
                地點匯入預覽與整理
              </h3>
              <p className="text-xs sm:text-sm font-semibold text-stone-500">
                共讀取 <span className="text-amber-700 font-bold">{places.length}</span> 筆地點，已選取{' '}
                <span className="text-teal-700 font-bold">{selectedIds.size}</span> 筆
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-stone-400 hover:text-stone-700 hover:bg-stone-200/60 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Excel Encoding Help Collapsible Banner */}
        <div className="px-5 py-2.5 bg-amber-50/80 border-b border-amber-200/80 text-xs sm:text-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 font-bold text-amber-900">
              <HelpCircle className="h-4 w-4 text-amber-700 shrink-0" />
              <span>為什麼在 Excel 打開 Google 匯出的 CSV 會是整片亂碼？</span>
            </div>
            <button
              type="button"
              onClick={() => setShowEncodingHelp((v) => !v)}
              className="inline-flex items-center gap-1 text-xs font-black text-amber-800 hover:underline cursor-pointer"
            >
              {showEncodingHelp ? '收合說明' : '查看原因與解法'}
              {showEncodingHelp ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
          {showEncodingHelp && (
            <div className="mt-2.5 pt-2 border-t border-amber-200/60 space-y-2 text-stone-700 leading-relaxed animate-in fade-in duration-150">
              <p>
                Google Takeout 匯出的 <code>.csv</code> 採用標準 UTF-8 編碼（無 BOM），而 Windows Excel 預設會以 Big5/ANSI 開啟，因此中文店名與路名會變成亂碼（例如 <code>握？暉 救 ???</code>）。
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-medium">
                <div className="rounded-xl bg-white p-2.5 border border-amber-200">
                  <div className="font-black text-teal-800 flex items-center gap-1">
                    <Check className="h-4 w-4 text-teal-600" />
                    <span>方式 A：直接在此畫面整理（最推薦）</span>
                  </div>
                  <p className="text-stone-600 text-xs mt-1">
                    系統已自動將 URL 與名稱解碼為可讀中文，並精確配對行政區。您可直接在下方勾選、剔除與確認匯入，免用 Excel！
                  </p>
                </div>
                <div className="rounded-xl bg-white p-2.5 border border-amber-200">
                  <div className="font-black text-amber-800 flex items-center gap-1">
                    <Download className="h-4 w-4 text-amber-600" />
                    <span>方式 B：下載 Excel 專用繁中 CSV</span>
                  </div>
                  <p className="text-stone-600 text-xs mt-1">
                    點擊左下角「下載 Excel 繁中相容 CSV」，本系統會產出包含 UTF-8 BOM 的檔案，在 Excel 點兩下秒開、繁體中文保證 100% 正常！
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Filter and Tool Bar */}
        <div className="px-5 py-3 border-b border-stone-200 bg-white flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
            {/* Search input */}
            <div className="relative flex-1 min-w-[160px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
              <input
                type="text"
                placeholder="搜尋店名、地址、備註..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-stone-50 pl-8 pr-3 py-1.5 text-xs sm:text-sm font-medium text-stone-800 placeholder:text-stone-400 focus:bg-white focus:border-amber-600 focus:outline-none"
              />
            </div>

            {/* City filter */}
            <select
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              className="rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs sm:text-sm font-bold text-stone-700 focus:bg-white focus:outline-none cursor-pointer"
            >
              <option value="ALL">全部縣市 ({places.length})</option>
              {availableCities.map((city) => {
                const count = places.filter((p) => p.city === city).length;
                return (
                  <option key={city} value={city}>
                    {city} ({count})
                  </option>
                );
              })}
            </select>

            {/* Category filter */}
            <select
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
              className="rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs sm:text-sm font-bold text-stone-700 focus:bg-white focus:outline-none cursor-pointer"
            >
              <option value="ALL">全部分類</option>
              {categoryConfigs.map((cfg) => (
                <option key={cfg.id} value={cfg.sub_category}>
                  🏷️ {cfg.sub_label}
                </option>
              ))}
            </select>
          </div>

          {/* Quick select buttons */}
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={selectAllFiltered}
              className="px-2.5 py-1.5 rounded-lg border border-stone-300 bg-stone-50 text-xs font-bold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              全選目前 ({filteredPlaces.length})
            </button>
            <button
              type="button"
              onClick={deselectAllFiltered}
              className="px-2.5 py-1.5 rounded-lg border border-stone-300 bg-stone-50 text-xs font-bold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              取消選取
            </button>
          </div>
        </div>

        {/* Place List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-2.5 divide-y divide-stone-100">
          {filteredPlaces.length === 0 ? (
            <div className="py-12 text-center text-stone-400 font-medium text-sm">
              沒有符合搜尋或篩選條件的地點
            </div>
          ) : (
            filteredPlaces.map((p, idx) => {
              const isChecked = selectedIds.has(p.id);
              const isEditing = editingId === p.id;
              return (
                <div
                  key={p.id}
                  className={`pt-2.5 first:pt-0 flex items-start gap-3 p-3 rounded-xl transition-all ${
                    isChecked
                      ? 'bg-amber-50/40 border border-amber-200/50'
                      : 'bg-stone-50/50 border border-transparent opacity-75'
                  }`}
                >
                  {/* Checkbox */}
                  <div className="pt-0.5 shrink-0">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => toggleSelect(p.id)}
                      className="h-4 w-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                    />
                  </div>

                  {/* Number index */}
                  <span className="text-xs font-bold text-stone-400 shrink-0 pt-0.5 w-6 text-right">
                    #{idx + 1}
                  </span>

                  {/* Main Details */}
                  <div className="flex-1 min-w-0 space-y-1">
                    {/* Place Name */}
                    {isEditing ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditName(p.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          autoFocus
                          className="flex-1 rounded-lg border border-amber-500 px-2 py-0.5 text-sm font-bold text-stone-900 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => saveEditName(p.id)}
                          className="px-2 py-0.5 rounded-md bg-stone-900 text-xs font-bold text-white cursor-pointer"
                        >
                          儲存
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-2">
                        <h4
                          onClick={() => startEditName(p)}
                          title="點擊可修改名稱"
                          className="text-sm sm:text-base font-black text-stone-900 hover:text-amber-800 cursor-pointer truncate"
                        >
                          {p.name}
                        </h4>
                      </div>
                    )}

                    {/* Tags: City & District Dropdowns, Category Dropdown */}
                    <div className="flex flex-wrap items-center gap-2 text-xs pt-0.5">
                      {/* Region Selector (City & District) */}
                      <div className="inline-flex items-center gap-1 bg-amber-50/90 border border-amber-300/80 rounded-lg px-2 py-0.5 shadow-2xs">
                        <MapPin className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                        {/* City Select */}
                        <select
                          aria-label={`${p.name} 選擇縣市`}
                          value={p.city}
                          onChange={(e) => {
                            const newCity = e.target.value;
                            const availableDistricts =
                              ALL_TAIWAN_CITY_DISTRICTS[newCity] || [];
                            const firstDist = availableDistricts[0] || '';
                            updatePlaceCityAndDistrict(p.id, newCity, firstDist);
                          }}
                          className="bg-transparent text-xs font-black text-amber-950 focus:outline-none cursor-pointer pr-1"
                          title="點擊更換縣市"
                        >
                          {ALL_TAIWAN_CITIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                          {!ALL_TAIWAN_CITIES.includes(p.city) && (
                            <option value={p.city}>{p.city}</option>
                          )}
                        </select>

                        <span className="text-amber-400 font-bold">・</span>

                        {/* District Select */}
                        <select
                          aria-label={`${p.name} 選擇行政區`}
                          value={p.district}
                          onChange={(e) => {
                            updatePlaceCityAndDistrict(
                              p.id,
                              p.city,
                              e.target.value
                            );
                          }}
                          className="bg-transparent text-xs font-black text-amber-950 focus:outline-none cursor-pointer pr-1"
                          title="點擊更換行政區"
                        >
                          {(
                            ALL_TAIWAN_CITY_DISTRICTS[p.city] || [p.district]
                          ).map((d) => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                          {!(
                            ALL_TAIWAN_CITY_DISTRICTS[p.city] || []
                          ).includes(p.district) && (
                            <option value={p.district}>{p.district}</option>
                          )}
                        </select>
                      </div>

                      {/* Category Selector Badge (100% Identical to PlaceCard after import!) */}
                      <select
                        aria-label={`${p.name} 分類切換`}
                        value={p.sub_category}
                        onChange={(e) =>
                          updatePlaceCategory(p.id, e.target.value)
                        }
                        className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-black text-amber-950 hover:bg-amber-100 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer shadow-2xs"
                        title="點擊更換分類（與景點卡片選項完全一致）"
                      >
                        {categoryConfigs.map((cfg) => (
                          <option key={cfg.id} value={cfg.sub_category}>
                            🏷️ {cfg.sub_label}
                          </option>
                        ))}
                        {!categoryConfigs.some(
                          (c) => c.sub_category === p.sub_category
                        ) && (
                          <option value={p.sub_category}>
                            🏷️ {p.sub_category}
                          </option>
                        )}
                      </select>

                      {/* User Notes / Google Maps Highlights */}
                      {p.user_notes && (
                        <span
                          className="text-stone-600 truncate max-w-[280px] sm:max-w-md text-xs font-medium"
                          title={p.user_notes}
                        >
                          📝 {p.user_notes}
                        </span>
                      )}
                    </div>

                    {/* Address */}
                    {p.formatted_address && (
                      <p className="text-xs text-stone-500 truncate">
                        {p.formatted_address}
                      </p>
                    )}
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-1 shrink-0 pt-0.5">
                    {p.google_maps_url && (
                      <a
                        href={p.google_maps_url}
                        target="_blank"
                        rel="noreferrer"
                        title="在 Google Maps 開啟"
                        className="p-1.5 rounded-lg text-stone-400 hover:text-amber-700 hover:bg-stone-200/50 transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => deletePlace(p.id)}
                      title="從清單移除"
                      className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-stone-200 bg-stone-50 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs sm:text-sm font-bold text-stone-700 hover:bg-stone-100 hover:border-amber-400 transition-colors shadow-2xs cursor-pointer w-full sm:w-auto"
            >
              <Download className="h-4 w-4 text-amber-700" />
              <span>匯出 Excel 專用繁中 CSV (含 BOM)</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs sm:text-sm font-bold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleFinalConfirm}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-5 py-2 text-xs sm:text-sm font-black text-white hover:bg-stone-800 transition-colors shadow-xs cursor-pointer"
            >
              <CheckCircle2 className="h-4 w-4 text-teal-400" />
              <span>確認匯入所選 ({selectedIds.size}) 個地點</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
