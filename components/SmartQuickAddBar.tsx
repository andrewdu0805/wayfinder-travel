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
      className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-600/10 text-amber-700">
            <Sparkles className="h-5 w-5" />
          </span>
          <h2 className="text-lg sm:text-xl font-extrabold text-stone-900">
            ➕ 新增地點（貼上 Google Maps 連結、店名或推薦文字）
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-paste-clipboard"
            type="button"
            onClick={handlePasteClipboard}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2 text-sm sm:text-base font-bold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <ClipboardPaste className="h-4 w-4 text-amber-700" />
            貼上剪貼簿
          </button>
          <button
            id="btn-toggle-takeout-import"
            type="button"
            onClick={() => setShowFileImport((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2 text-sm sm:text-base font-bold text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
          >
            <FileUp className="h-4 w-4 text-teal-700" />
            匯入檔案
          </button>
        </div>
      </div>

      {/* Main Large Input Box */}
      <div className="flex flex-col sm:flex-row gap-3">
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
            placeholder="例如：六千泓佐牛肉湯 台南中西區必吃早餐，或直接貼上 Google Maps 網址..."
            className="w-full rounded-xl border-2 border-stone-300 bg-stone-50/70 px-4 py-3 text-base sm:text-lg font-medium text-stone-900 placeholder:text-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none transition-colors resize-none"
          />
        </div>
        <button
          id="btn-smart-save"
          type="button"
          disabled={isParsing || !inputText.trim()}
          onClick={() => handleSmartSubmit()}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 px-6 py-3.5 text-base sm:text-lg font-extrabold text-white hover:bg-stone-800 disabled:opacity-45 transition-all cursor-pointer shrink-0"
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
        <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-sm sm:text-base text-stone-700 font-medium">
            支援匯入 Google Takeout <code>Saved Places.json</code>、<code>.csv</code> 或備份檔
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
              className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm sm:text-base font-bold text-white hover:bg-teal-800 transition-colors cursor-pointer"
            >
              <Upload className="h-4 w-4" />
              選擇檔案
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-base font-bold text-red-700">
          {errorMsg}
        </div>
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
