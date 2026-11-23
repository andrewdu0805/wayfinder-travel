'use client';

import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  ClipboardPaste,
  FileUp,
  Loader2,
  RefreshCw,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { usePlaces } from '@/context/PlacesContext';
import { ALL_AVAILABLE_CITIES } from '@/lib/default-data';
import {
  extractCoordsFromGoogleMapsUrl,
  extractRegionFromAddress,
  getCoordinatesForRegion,
  inferPlaceCategoryByName,
  separateNameAndAddress,
} from '@/lib/geo-utils';
import { SavedPlace, VisitStatus } from '@/types/place';
import { ImportPreviewModal } from '@/components/ImportPreviewModal';
import { resolvePlaceDescription } from '@/lib/place-notes';
import { resolvePlaceFromGoogleMapsUrl } from '@/lib/place-resolver';

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

interface SmartQuickAddBarProps {
  activeCity: string;
}

export function SmartQuickAddBar({ activeCity }: SmartQuickAddBarProps) {
  const {
    places,
    categoryConfigs,
    settings,
    recentUpserts,
    smartUpsertPlaces,
    updatePlaceInline,
    clearRecentUpserts,
  } = usePlaces();

  const [inputText, setInputText] = useState('');
  const [selectedCityOverride, setSelectedCityOverride] = useState<string>('');
  const [isParsing, setIsParsing] = useState(false);
  const [showFileImport, setShowFileImport] = useState(false);
  const [previewPlaces, setPreviewPlaces] = useState<SavedPlace[] | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [importInfoMsg, setImportInfoMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSmartSubmit = async (overrideText?: string) => {
    const targetText = (overrideText ?? inputText).trim();
    if (!targetText) return;

    setIsParsing(true);
    setErrorMsg(null);
    try {
      const targetCity =
        selectedCityOverride || (activeCity === 'ALL' ? '' : activeCity);
      const res = await fetch('/api/smart-parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: targetText,
          defaultCity: targetCity,
          categoryConfigs,
          geminiApiKey: settings.geminiApiKey,
          googleMapsApiKey: settings.googleMapsApiKey,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.places) {
        throw new Error(data.error || '解析失敗');
      }
      smartUpsertPlaces(data.places);
      if (!overrideText) {
        setInputText('');
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : '解析過程發生錯誤，請重試'
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip && clip.trim()) {
        setInputText(clip.trim());
        await handleSmartSubmit(clip.trim());
      }
    } catch {
      setErrorMsg('請直接在輸入框按 Ctrl+V / 長按貼上內容');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErrorMsg(null);

    try {
      const text = await file.text();
      const nowIso = new Date().toISOString();
      const imported: SavedPlace[] = [];
      const fileNameCityCheck = extractRegionFromAddress(file.name, null, '');
      const fallbackCity =
        fileNameCityCheck.city ||
        selectedCityOverride ||
        (activeCity && activeCity !== 'ALL' ? activeCity : '台南市');

      if (file.name.endsWith('.json') || file.name.endsWith('.geojson')) {
        const json = JSON.parse(text);
        // Case 1: App backup array of SavedPlaces
        if (Array.isArray(json)) {
          for (const item of json) {
            if (item.name && item.latitude && item.longitude) {
              imported.push(item as SavedPlace);
            }
          }
        }
        // Case 2: Google Takeout GeoJSON FeatureCollection
        else if (
          json.type === 'FeatureCollection' &&
          Array.isArray(json.features)
        ) {
          for (let i = 0; i < json.features.length; i++) {
            const feat = json.features[i];
            const coords = feat.geometry?.coordinates;
            const props = feat.properties || {};
            const locObj = props.Location || props.location || {};
            const rawTitle =
              props.Title ||
              props.title ||
              props.name ||
              locObj['Business Name'] ||
              locObj.name ||
              `匯入景點 #${i + 1}`;
            const sep = separateNameAndAddress(String(rawTitle));
            const title = sep.cleanName || String(rawTitle);
            const rawAddress =
              locObj.Address ||
              locObj.address ||
              props.address ||
              sep.foundAddress ||
              '';
            const hasValidCoords =
              Array.isArray(coords) &&
              (Number(coords[0]) !== 0 || Number(coords[1]) !== 0);
            const gmapsUrl =
              props['Google Maps URL'] || props.google_maps_url || '';
            const urlCoords = extractCoordsFromGoogleMapsUrl(gmapsUrl);
            const rawLng = hasValidCoords
              ? Number(coords[0])
              : urlCoords?.lng ?? NaN;
            const rawLat = hasValidCoords
              ? Number(coords[1])
              : urlCoords?.lat ?? NaN;

            const region = extractRegionFromAddress(
              `${rawAddress} ${title} ${rawTitle} ${gmapsUrl}`,
              !isNaN(rawLat) && !isNaN(rawLng)
                ? { lat: rawLat, lng: rawLng }
                : null,
              fallbackCity
            );
            const fallbackCoords = getCoordinatesForRegion(
              region.city,
              region.district,
              title
            );
            const lat = !isNaN(rawLat) ? rawLat : fallbackCoords.lat;
            const lng = !isNaN(rawLng) ? rawLng : fallbackCoords.lng;
            const cat = inferPlaceCategoryByName(
              `${title} ${props.Comment || props.Note || ''}`
            );

            imported.push({
              id: `takeout-${Date.now()}-${i}`,
              google_place_id: gmapsUrl || `takeout_${title}_${i}`,
              name: title,
              formatted_address:
                rawAddress || `${region.country}${region.city}${region.district}`,
              country: region.country,
              city: region.city,
              district: region.district,
              latitude: lat,
              longitude: lng,
              primary_category: cat.primary_category,
              sub_category: cat.sub_category,
              visit_status: 'unvisited',
              business_status: 'OPERATIONAL',
              estimated_stay_mins: cat.estimated_stay_mins,
              rating: 4.5,
              opening_hours_json: {
                open_now: true,
                weekday_descriptions: ['每日 10:00–21:00'],
                daily_hours: { open: '10:00', close: '21:00' },
              },
              google_maps_url:
                gmapsUrl ||
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  `${title} ${region.city}`
                )}`,
              user_notes:
                (props.Comment || props.Note || props.note) &&
                props.Comment !== '由 Google Takeout 匯入' &&
                props.Note !== '由 Google Takeout 匯入'
                  ? props.Comment || props.Note || props.note
                  : resolvePlaceDescription(
                      title,
                      region.city,
                      region.district,
                      cat.sub_category,
                      rawAddress
                    ),
              custom_tags: ['#Takeout匯入'],
              last_visited_at: null,
              hours_updated_at: nowIso,
              created_at: nowIso,
              updated_at: nowIso,
            });
          }
        }
      } else if (file.name.endsWith('.csv')) {
        const lines = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);

        const batchRows: Array<{
          url: string;
          title: string;
          note: string;
          rowCoords: { lat: number; lng: number } | null;
        }> = [];

        for (let i = 0; i < lines.length; i++) {
          const cols = parseCsvLine(lines[i]);
          const firstCol = (cols[0] || '').trim();
          // Skip header row or blank rows (including corrupted Big5 headers like '琿？ 螭？ 蝮廢?')
          if (
            !firstCol ||
            /^(標題|店名|名稱|Title|Name)$/i.test(firstCol) ||
            /^(琿|螭|蝮|摨)/.test(firstCol)
          ) {
            continue;
          }
          const note = cols[1] || '';
          // Scan across all columns in this CSV row for coordinates & URLs:
          let rowCoords: { lat: number; lng: number } | null = null;
          let foundUrl = '';

          for (let c = 0; c < cols.length; c++) {
            const val = (cols[c] || '').trim();
            if (/https?:\/\/[^\s)]+/i.test(val)) {
              if (!foundUrl) foundUrl = val;
              const extracted = extractCoordsFromGoogleMapsUrl(val);
              if (extracted && !rowCoords) rowCoords = extracted;
            }
            // Check combined "lat, lng" in a column
            const combMatch = val.match(/^([0-9]{2}\.[0-9]{3,8})\s*,\s*([0-9]{2,3}\.[0-9]{3,8})$/);
            if (combMatch && !rowCoords) {
              const p1 = parseFloat(combMatch[1]);
              const p2 = parseFloat(combMatch[2]);
              if (p1 >= 21.0 && p1 <= 26.5 && p2 >= 118.0 && p2 <= 123.0) rowCoords = { lat: p1, lng: p2 };
              else if (p2 >= 21.0 && p2 <= 26.5 && p1 >= 118.0 && p1 <= 123.0) rowCoords = { lat: p2, lng: p1 };
            }
            // Check two adjacent numeric columns (lat, lng)
            if (c + 1 < cols.length && !rowCoords) {
              const n1 = parseFloat(cols[c]);
              const n2 = parseFloat(cols[c + 1]);
              if (!isNaN(n1) && !isNaN(n2)) {
                if (n1 >= 21.0 && n1 <= 26.5 && n2 >= 118.0 && n2 <= 123.0) rowCoords = { lat: n1, lng: n2 };
                else if (n2 >= 21.0 && n2 <= 26.5 && n1 >= 118.0 && n1 <= 123.0) rowCoords = { lat: n2, lng: n1 };
              }
            }
          }

          const url = foundUrl || cols[2] || '';
          batchRows.push({
            url,
            title: firstCol,
            note,
            rowCoords,
          });
        }

        // Deduplicate CSV rows against existing saved places BEFORE calling Google Maps API!
        const normName = (s: string) =>
          (s || '')
            .replace(/\([^)]*\)|（[^）]*）|【[^】]*】/g, '')
            .replace(/\s+/g, '')
            .toLowerCase();
        const extractUrlToken = (u: string) => {
          const s2 = (u || '').match(/(0x[0-9a-f]{15,16}:0x[0-9a-f]+)/i);
          if (s2) return s2[1].toLowerCase();
          const cid = (u || '').match(/[?&]cid=([0-9]+)/);
          if (cid) return `cid_${cid[1]}`;
          return '';
        };

        const existingUrls = new Set<string>();
        const existingTokens = new Set<string>();
        const existingNames = new Set<string>();
        for (const p of places) {
          if (p.google_maps_url) {
            existingUrls.add(p.google_maps_url.trim());
            const tok = extractUrlToken(p.google_maps_url);
            if (tok) existingTokens.add(tok);
          }
          if (p.google_place_id) {
            existingTokens.add(p.google_place_id.trim().toLowerCase());
          }
          const nn = normName(p.name);
          if (nn.length >= 2) existingNames.add(nn);
        }

        const newBatchRows = batchRows.filter((row) => {
          const cleanUrl = (row.url || '').trim();
          if (cleanUrl && existingUrls.has(cleanUrl)) return false;
          const tok = extractUrlToken(cleanUrl);
          if (tok && existingTokens.has(tok)) return false;
          const nn = normName(row.title);
          if (nn.length >= 2 && existingNames.has(nn)) return false;
          return true;
        });

        const skippedExistingCount = batchRows.length - newBatchRows.length;
        setImportInfoMsg(null);

        if (newBatchRows.length === 0 && batchRows.length > 0) {
          setImportInfoMsg(
            `✅ 此 CSV 的 ${batchRows.length} 筆地點皆已存在於清單中，已自動全部略過（未消耗 Google Maps API 額度）！`
          );
          setShowFileImport(false);
          return;
        }

        // Batch Google Maps URL resolution: ONLY query Google Maps API for newly added rows!
        setIsParsing(true);
        try {
          const res = await fetch('/api/smart-parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              batch: newBatchRows,
              defaultCity: fallbackCity,
              categoryConfigs,
              googleMapsApiKey: settings.googleMapsApiKey,
              geminiApiKey: settings.geminiApiKey,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.places) && data.places.length > 0) {
              imported.push(...data.places);
            }
          }
        } catch (fetchErr) {
          console.warn('Batch parse server fetch error, falling back to local resolver:', fetchErr);
        } finally {
          setIsParsing(false);
        }

        // If server was offline or returned empty, resolve locally with identical URL-first logic!
        if (imported.length === 0 && newBatchRows.length > 0) {
          for (const row of newBatchRows) {
            const resolved = resolvePlaceFromGoogleMapsUrl({
              url: row.url,
              fallbackTitle: row.title,
              userNote: row.note,
              defaultCity: fallbackCity,
              categoryConfigs,
              customTags: ['#GoogleMaps匯入'],
              rowCoords: row.rowCoords,
            });
            imported.push(resolved);
          }
        }

        if (skippedExistingCount > 0) {
          setImportInfoMsg(
            `💡 已自動略過清單中原本就有的 ${skippedExistingCount} 筆地點，僅對 ${newBatchRows.length} 筆新地點查詢 Google Maps！`
          );
        }
      }

      if (imported.length > 0) {
        setPreviewPlaces(imported);
        setShowFileImport(false);
      } else {
        setErrorMsg('檔案中找不到可匯入的景點資料，請確認格式');
      }
    } catch {
      setErrorMsg('解析檔案失敗，請確認為有效的 GeoJSON / JSON 或 CSV');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <section
      id="smart-quick-add-section"
      className="rounded-2xl border border-stone-200 bg-white p-3.5 sm:p-5 shadow-xs space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="inline-flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-amber-600/10 text-amber-700 shrink-0">
            <Sparkles className="h-4 w-4 text-amber-600" />
          </span>
          <h2 className="text-base sm:text-lg font-black text-stone-900 whitespace-nowrap">
            ➕ 新增
          </h2>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            id="btn-paste-clipboard"
            type="button"
            onClick={handlePasteClipboard}
            className="inline-flex items-center gap-1 rounded-xl border border-stone-300 bg-stone-50 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-extrabold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer whitespace-nowrap"
          >
            <ClipboardPaste className="h-3.5 w-3.5 text-amber-700 shrink-0" />
            <span>貼上剪貼簿</span>
          </button>
          <button
            id="btn-toggle-takeout-import"
            type="button"
            onClick={() => setShowFileImport((v) => !v)}
            className="inline-flex items-center gap-1 rounded-xl border border-stone-300 bg-stone-50 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-extrabold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer whitespace-nowrap"
          >
            <FileUp className="h-3.5 w-3.5 text-teal-700 shrink-0" />
            <span>匯入</span>
          </button>
        </div>
      </div>

      {/* 指定新增地區／智慧辨識（防折行、防溢出） */}
      <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50/90 px-3 py-2 text-sm font-bold text-stone-700 w-full overflow-hidden">
        <span className="shrink-0 text-xs sm:text-sm font-black text-stone-700 whitespace-nowrap">
          📍 地區：
        </span>
        <select
          value={selectedCityOverride || (activeCity !== 'ALL' ? activeCity : '')}
          onChange={(e) => setSelectedCityOverride(e.target.value)}
          className="w-full min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-extrabold text-stone-900 focus:border-amber-600 focus:outline-none cursor-pointer truncate"
        >
          <option value="">🌐 自動辨識（依網址／店名）</option>
          {ALL_AVAILABLE_CITIES.map((c) => (
            <option key={c} value={c}>
              📍 {c}
            </option>
          ))}
        </select>
      </div>

      {/* Main Large Input Box */}
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
        <div className="relative flex-1">
          <textarea
            id="smart-parse-textarea"
            rows={2}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                handleSmartSubmit();
              }
            }}
            placeholder="貼上 Google Maps 網址或輸入店名（例如：阿堂鹹粥 台南必吃）..."
            className="w-full rounded-xl border-2 border-stone-300 bg-stone-50/70 px-3.5 py-2.5 text-base sm:text-lg font-medium text-stone-900 placeholder:text-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none transition-colors resize-none"
          />
        </div>
        <button
          id="btn-smart-save"
          type="button"
          disabled={isParsing || !inputText.trim()}
          onClick={() => handleSmartSubmit()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 sm:px-6 py-2.5 sm:py-3.5 text-base sm:text-lg font-black text-white hover:bg-stone-800 disabled:opacity-45 transition-all cursor-pointer shrink-0"
        >
          {isParsing ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              解析中...
            </>
          ) : (
            <>
              <Sparkles className="h-5 w-5 text-amber-400" />
              存入清單
            </>
          )}
        </button>
      </div>

      {/* Optional Collapsible File Import Dropzone */}
      {showFileImport && (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-4 sm:p-5 space-y-3.5">
          {/* Friendly Tip about Excel Encoding */}
          <div className="rounded-xl border border-amber-200 bg-amber-50/80 p-3 sm:p-4 text-xs sm:text-sm text-stone-700 space-y-2">
            <div className="flex items-center gap-2 font-bold text-amber-900">
              <Sparkles className="h-4 w-4 text-amber-700 shrink-0" />
              <span>匯入前不用辛苦在 Excel 整理！系統提供直接預覽整理</span>
            </div>
            <p className="text-stone-600 leading-relaxed text-xs sm:text-sm">
              Google Takeout 輸出的 CSV 是標準 UTF-8 編碼（無 BOM），Windows Excel 點開常會變成「亂碼」。您<strong>不需要先手動修改 Excel</strong>，直接將檔案選入此處，系統會自動解碼中文並開啟<strong>「預覽整理面板」</strong>供您挑選、剔除與確認；或可一鍵下載在 Excel 完美顯示的繁中 CSV！
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
            <div className="text-xs sm:text-sm text-stone-600 font-medium">
              支援 Google Takeout <code>已儲存的地點.csv</code>、<code>Saved Places.json</code> 或自製 CSV
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.geojson,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                id="btn-select-import-file"
                type="button"
                disabled={isParsing}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
              >
                {isParsing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    依據網址批次解析中...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    選擇檔案並整理
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-base font-bold text-red-700">
          {errorMsg}
        </div>
      )}

      {importInfoMsg && (
        <div className="flex items-center justify-between gap-2 rounded-xl bg-teal-50 border border-teal-200 px-4 py-2.5 text-sm font-bold text-teal-900">
          <span>{importInfoMsg}</span>
          <button
            type="button"
            onClick={() => setImportInfoMsg(null)}
            className="rounded-lg p-1 text-teal-700 hover:bg-teal-100 cursor-pointer shrink-0"
            title="關閉提示"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Import Preview & Tidy Modal */}
      {previewPlaces && (
        <ImportPreviewModal
          initialPlaces={previewPlaces}
          categoryConfigs={categoryConfigs}
          onConfirmImport={(selectedPlaces) => {
            smartUpsertPlaces(selectedPlaces);
            setPreviewPlaces(null);
          }}
          onClose={() => setPreviewPlaces(null)}
        />
      )}

      {/* Instant Inline Edit Banner */}
      {recentUpserts.length > 0 && (
        <div
          id="recent-upserts-banner"
          className="rounded-xl border-2 border-emerald-300 bg-emerald-50/70 p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-700" />
              <span className="text-base font-extrabold text-emerald-950">
                已存入 {recentUpserts.length} 筆地點！可立即調整分類或狀態：
              </span>
            </div>
            <button
              id="btn-dismiss-recent-upserts"
              type="button"
              onClick={clearRecentUpserts}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1 text-sm font-bold text-stone-600 hover:bg-stone-200/60 cursor-pointer"
            >
              <X className="h-4 w-4" />
              收起
            </button>
          </div>

          <div className="space-y-2.5">
            {recentUpserts.map((rec) => {
              const p = rec.place;
              return (
                <div
                  key={p.id}
                  className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-lg text-stone-900">
                      {p.name}
                    </span>
                    <span className="text-base text-stone-500 font-medium">
                      ({p.city}・{p.district})
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`修改 ${p.name} 分類`}
                      value={p.sub_category}
                      onChange={(e) => {
                        const nextSub = e.target.value;
                        const cfg = categoryConfigs.find(
                          (c) => c.sub_category === nextSub
                        );
                        if (cfg) {
                          updatePlaceInline(p.id, {
                            primary_category: cfg.primary_category,
                            sub_category: cfg.sub_category,
                            estimated_stay_mins: cfg.default_stay_mins,
                          });
                        }
                      }}
                      className="rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-base font-bold text-stone-800 cursor-pointer"
                    >
                      {categoryConfigs.map((cfg) => (
                        <option key={cfg.id} value={cfg.sub_category}>
                          {cfg.sub_label}
                        </option>
                      ))}
                    </select>

                    <div className="inline-flex rounded-xl border border-stone-300 bg-stone-50 p-1 gap-1">
                      {(
                        [
                          { key: 'unvisited', label: '🌟 想去' },
                          { key: 'visited_revisit', label: '❤️ 想再去' },
                          { key: 'visited_skip', label: '🚫 不推' },
                        ] as Array<{ key: VisitStatus; label: string }>
                      ).map((st) => (
                        <button
                          key={st.key}
                          type="button"
                          onClick={() =>
                            updatePlaceInline(p.id, { visit_status: st.key })
                          }
                          className={`rounded-lg px-3 py-1.5 text-sm sm:text-base font-bold transition-colors cursor-pointer ${
                            p.visit_status === st.key
                              ? 'bg-stone-900 text-white'
                              : 'text-stone-600 hover:text-stone-900'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
