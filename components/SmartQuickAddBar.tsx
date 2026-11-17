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
import { QUICK_ADD_DEMO_PRESETS } from '@/lib/default-data';
import { extractRegionFromAddress } from '@/lib/geo-utils';
import { SavedPlace, VisitStatus } from '@/types/place';

interface SmartQuickAddBarProps {
  activeCity: string;
}

export function SmartQuickAddBar({ activeCity }: SmartQuickAddBarProps) {
  const {
    categoryConfigs,
    settings,
    recentUpserts,
    smartUpsertPlaces,
    updatePlaceInline,
    clearRecentUpserts,
  } = usePlaces();

  const [inputText, setInputText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [showFileImport, setShowFileImport] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleSmartSubmit = async (overrideText?: string) => {
    const targetText = (overrideText ?? inputText).trim();
    if (!targetText) return;

    setIsParsing(true);
    setErrorMsg(null);
    try {
      const targetCity =
        activeCity === 'ALL' ? '高雄市' : activeCity;
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

      if (file.name.endsWith('.json')) {
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
            const title =
              props.Title ||
              props.name ||
              props.Location?.['Business Name'] ||
              `匯入景點 #${i + 1}`;
            const address =
              props.Location?.Address || props.address || '台灣高雄市鹽埕區';
            const lng = Array.isArray(coords) ? Number(coords[0]) : 120.2835;
            const lat = Array.isArray(coords) ? Number(coords[1]) : 22.6234;
            const region = extractRegionFromAddress(address);

            imported.push({
              id: `takeout-${Date.now()}-${i}`,
              google_place_id:
                props.google_maps_url || `takeout_${title}_${i}`,
              name: title,
              formatted_address: address,
              country: region.country,
              city: region.city,
              district: region.district,
              latitude: lat || 22.6234,
              longitude: lng || 120.2835,
              primary_category: 'restaurant',
              sub_category: 'meal',
              visit_status: 'unvisited',
              business_status: 'OPERATIONAL',
              estimated_stay_mins: 60,
              rating: 4.4,
              opening_hours_json: {
                open_now: true,
                weekday_descriptions: ['每日 10:00–21:00'],
                daily_hours: { open: '10:00', close: '21:00' },
              },
              google_maps_url:
                props['Google Maps URL'] ||
                `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  title
                )}`,
              user_notes: props.Comment || props.Note || '由 Google Takeout 匯入',
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
        // Skip header row
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, ''));
          const title = cols[0] || `CSV景點 #${i}`;
          const note = cols[1] || '';
          const url = cols[2] || '';
          imported.push({
            id: `csv-${Date.now()}-${i}`,
            google_place_id: `csv_${title}`,
            name: title,
            formatted_address: '台灣高雄市鹽埕區',
            country: '台灣',
            city: '高雄市',
            district: '鹽埕區',
            latitude: 22.6234 + (i % 5) * 0.0015,
            longitude: 120.2835 + (i % 5) * 0.0015,
            primary_category: 'restaurant',
            sub_category: 'meal',
            visit_status: 'unvisited',
            business_status: 'OPERATIONAL',
            estimated_stay_mins: 60,
            rating: 4.4,
            opening_hours_json: {
              open_now: true,
              weekday_descriptions: ['每日 10:00–21:00'],
              daily_hours: { open: '10:00', close: '21:00' },
            },
            google_maps_url:
              url ||
              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                title
              )}`,
            user_notes: note || '由 CSV 清單匯入',
            custom_tags: ['#CSV匯入'],
            last_visited_at: null,
            hours_updated_at: nowIso,
            created_at: nowIso,
            updated_at: nowIso,
          });
        }
      }

      if (imported.length > 0) {
        smartUpsertPlaces(imported);
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
      className="rounded-2xl border border-stone-200/90 bg-white p-4 sm:p-5 shadow-sm transition-all"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-600/10 text-amber-700">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm sm:text-base font-semibold text-stone-900">
              全能智慧解析秒存列（貼連結／店名／IG 多店推薦文）
            </h2>
            <p className="text-xs text-stone-500">
              貼上即自動存入並判別分類；遇到已收藏店家會自動更新營業時間、保留原狀態並附加新備註
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-paste-clipboard"
            type="button"
            onClick={handlePasteClipboard}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <ClipboardPaste className="h-3.5 w-3.5 text-amber-700" />
            讀取剪貼簿秒存
          </button>
          <button
            id="btn-toggle-takeout-import"
            type="button"
            onClick={() => setShowFileImport((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-medium text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <FileUp className="h-3.5 w-3.5 text-teal-700" />
            匯入 Takeout / 備份檔
          </button>
        </div>
      </div>

      {/* Main Smart Input Box */}
      <div className="flex flex-col sm:flex-row gap-2.5">
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
            placeholder="貼上 Google Maps 短網址 (maps.app.goo.gl/...)、直接輸入「店名＋筆記 #標籤」，或貼上整段 IG 推薦文案（如：去鹽埕先去「銀座聚場」吃布丁，晚餐吃「港園牛肉麵」...）"
            className="w-full rounded-xl border border-stone-300 bg-stone-50/60 px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none transition-colors resize-none"
          />
        </div>
        <button
          id="btn-smart-save"
          type="button"
          disabled={isParsing || !inputText.trim()}
          onClick={() => handleSmartSubmit()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-5 py-3 text-sm font-semibold text-white hover:bg-stone-800 disabled:opacity-45 transition-all cursor-pointer shrink-0"
        >
          {isParsing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              智慧解析中...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 text-amber-400" />
              秒存並自動分類
            </>
          )}
        </button>
      </div>

      {/* 1-Click Test Presets */}
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-medium text-stone-400 mr-1">
          一鍵體驗秒存與去重更新：
        </span>
        {QUICK_ADD_DEMO_PRESETS.map((preset) => (
          <button
            key={preset.id}
            id={`btn-preset-${preset.id}`}
            type="button"
            disabled={isParsing}
            onClick={() => {
              setInputText(preset.input);
              handleSmartSubmit(preset.input);
            }}
            className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs text-stone-600 hover:border-amber-400 hover:bg-amber-50/60 hover:text-stone-900 transition-colors cursor-pointer"
          >
            <span>⚡ {preset.badge}</span>
          </button>
        ))}
      </div>

      {/* Optional Collapsible File Import Dropzone */}
      {showFileImport && (
        <div className="mt-3 rounded-xl border border-dashed border-stone-300 bg-stone-50 p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-stone-600">
            <p className="font-semibold text-stone-800">
              批次增量合併匯入（自動比對去重，不會覆蓋您已標記的「去過／想再去」狀態）
            </p>
            <p className="text-stone-500 mt-0.5">
              支援 Google Takeout 匯出的 <code>Saved Places.json</code>{' '}
              (GeoJSON)、清單 <code>.csv</code> 或本系統匯出的 JSON 備份檔
            </p>
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
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-teal-800 transition-colors cursor-pointer"
            >
              <Upload className="h-3.5 w-3.5" />
              選擇檔案匯入
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="mt-2.5 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Instant Inline Edit Banner ("秒存＋行內秒改") */}
      {recentUpserts.length > 0 && (
        <div
          id="recent-upserts-banner"
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 transition-all"
        >
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              <span className="text-xs font-semibold text-emerald-950">
                已秒存 {recentUpserts.length} 筆景點！點擊下方標籤即可 1 秒微調分類或造訪狀態：
              </span>
            </div>
            <button
              id="btn-dismiss-recent-upserts"
              type="button"
              onClick={clearRecentUpserts}
              className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-stone-500 hover:bg-stone-200/60 hover:text-stone-800 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
              收起
            </button>
          </div>

          <div className="space-y-2">
            {recentUpserts.map((rec) => {
              const p = rec.place;
              return (
                <div
                  key={p.id}
                  className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 rounded-lg border border-white bg-white/95 px-3 py-2.5 shadow-2xs"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {rec.action === 'updated_existing' ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
                        <RefreshCw className="h-3 w-3" />
                        智慧合併既有收藏（已保留狀態並附加備註）
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                        ✨ 新增入庫
                      </span>
                    )}
                    <span className="font-semibold text-sm text-stone-900">
                      {p.name}
                    </span>
                    <span className="text-xs text-stone-500">
                      ({p.city}・{p.district})
                    </span>
                    {p.user_notes && (
                      <span className="text-xs text-stone-600 bg-stone-100 px-2 py-0.5 rounded">
                        📝 {p.user_notes}
                      </span>
                    )}
                  </div>

                  {/* 1-Tap Inline Category & Visit Status Switcher */}
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
                      className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-medium text-stone-800 focus:border-amber-600 focus:outline-none cursor-pointer"
                    >
                      {categoryConfigs.map((cfg) => (
                        <option key={cfg.id} value={cfg.sub_category}>
                          {cfg.primary_label} ➔ {cfg.sub_label} (預設{' '}
                          {cfg.default_stay_mins}分)
                        </option>
                      ))}
                    </select>

                    <div className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5">
                      {(
                        [
                          { key: 'unvisited', label: '🌟 沒去過' },
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
                          className={`rounded-md px-2 py-1 text-xs font-medium transition-colors cursor-pointer ${
                            p.visit_status === st.key
                              ? 'bg-stone-900 text-white shadow-2xs'
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
