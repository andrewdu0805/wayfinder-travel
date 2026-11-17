'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Clock,
  Compass,
  ExternalLink,
  Loader2,
  LocateFixed,
  Navigation,
  Plus,
  RefreshCw,
  Repeat,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import { usePlaces } from '@/context/PlacesContext';
import { PRESET_DESTINATIONS } from '@/lib/default-data';
import {
  addMinutesToTime,
  buildGoogleMapsDirUrl,
  calculateDistanceMeters,
  checkPlaceOpenAtTime,
  estimateTravelMins,
} from '@/lib/geo-utils';
import {
  IntentStepBlock,
  ItineraryPlan,
  ItineraryStop,
  SavedPlace,
  TravelMode,
  VisitStatus,
} from '@/types/place';
import { RouteVisualizerMap } from './RouteVisualizerMap';

const DEFAULT_BLOCKS: IntentStepBlock[] = [
  {
    id: 'blk-1',
    label: '沒去過的博物館／展館',
    primary_category: 'museum_culture',
    sub_category: 'museum',
    only_unvisited: true,
  },
  {
    id: 'blk-2',
    label: '餐廳：正餐',
    primary_category: 'restaurant',
    sub_category: 'meal',
    only_unvisited: false,
  },
  {
    id: 'blk-3',
    label: '餐廳：點心／下午茶',
    primary_category: 'restaurant',
    sub_category: 'snack_dessert',
    only_unvisited: false,
  },
  {
    id: 'blk-4',
    label: '餐廳：伴手禮',
    primary_category: 'restaurant',
    sub_category: 'souvenir',
    only_unvisited: false,
  },
];

export function ItineraryPlannerView() {
  const {
    places,
    categoryConfigs,
    updatePlaceInline,
    refreshPlacesHours,
  } = usePlaces();

  const [selectedPresetId, setSelectedPresetId] = useState(
    PRESET_DESTINATIONS[0].id
  );
  const [origin, setOrigin] = useState({
    name: PRESET_DESTINATIONS[0].label,
    latitude: PRESET_DESTINATIONS[0].latitude,
    longitude: PRESET_DESTINATIONS[0].longitude,
  });
  const [startTime, setStartTime] = useState('14:00');
  const [travelMode, setTravelMode] = useState<TravelMode>('WALK');
  const [radiusMeters, setRadiusMeters] = useState(5000);
  const [intentBlocks, setIntentBlocks] =
    useState<IntentStepBlock[]>(DEFAULT_BLOCKS);
  const [intentText, setIntentText] = useState(
    '我們現在在鹽埕區，想找沒去過的展覽館逛一下，晚餐吃附近收藏的正餐，接著吃個點心，最後順路買個伴手禮回飯店'
  );

  const [plans, setPlans] = useState<ItineraryPlan[]>([]);
  const [activePlanIndex, setActivePlanIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [openSwapStopIndex, setOpenSwapStopIndex] = useState<number | null>(
    null
  );
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activePlan = plans[activePlanIndex] || null;

  // Candidates within current radius for radar visualization
  const nearbyCandidates = places.filter((p) => {
    const dist = calculateDistanceMeters(
      origin.latitude,
      origin.longitude,
      p.latitude,
      p.longitude
    );
    return (
      dist <= radiusMeters &&
      p.visit_status !== 'visited_skip' &&
      p.business_status !== 'CLOSED_PERMANENTLY'
    );
  });

  const handleGenerateItinerary = useCallback(
    async (
      overrideOrigin?: { name: string; latitude: number; longitude: number },
      overrideText?: string,
      overrideBlocks?: IntentStepBlock[]
    ) => {
      setIsGenerating(true);
      setErrorMsg(null);
      setOpenSwapStopIndex(null);

      const targetOrigin = overrideOrigin || origin;
      try {
        const res = await fetch('/api/chain-itinerary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            places,
            origin: targetOrigin,
            radiusMeters,
            startTime,
            travelMode,
            intentText: overrideText ?? intentText,
            intentBlocks: overrideBlocks ?? intentBlocks,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.plans || data.plans.length === 0) {
          throw new Error(
            data.error || '找不到符合條件的串聯路線，請嘗試放寬搜尋半徑'
          );
        }
        setPlans(data.plans);
        setActivePlanIndex(0);
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : '行程串聯運算失敗'
        );
      } finally {
        setIsGenerating(false);
      }
    },
    [origin, places, radiusMeters, startTime, travelMode, intentText, intentBlocks]
  );

  // Auto-generate initial itinerary on first mount so user sees immediate rich timeline
  useEffect(() => {
    if (places.length > 0 && plans.length === 0) {
      handleGenerateItinerary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Recalculate arrival/departure times, travel durations, and Google Maps URL
   * whenever user swaps a stop, reorders stops, or changes stay duration on the timeline!
   */
  const recalculateActivePlanStops = (nextStopsRaw: ItineraryStop[]) => {
    if (!activePlan) return;

    let clock = activePlan.start_time;
    let prevLat = activePlan.origin.latitude;
    let prevLng = activePlan.origin.longitude;
    let totalTravel = 0;
    let totalDist = 0;
    let totalStay = 0;

    const recalculatedStops: ItineraryStop[] = nextStopsRaw.map((stop, idx) => {
      const dist = calculateDistanceMeters(
        prevLat,
        prevLng,
        stop.place.latitude,
        stop.place.longitude
      );
      const tMins = estimateTravelMins(dist, activePlan.travel_mode);
      const arr = addMinutesToTime(clock, tMins);
      const dep = addMinutesToTime(arr, stop.stay_mins);
      const openInfo = checkPlaceOpenAtTime(
        stop.place.opening_hours_json,
        stop.place.business_status,
        arr
      );

      clock = dep;
      prevLat = stop.place.latitude;
      prevLng = stop.place.longitude;
      totalTravel += tMins;
      totalDist += dist;
      totalStay += stop.stay_mins;

      return {
        ...stop,
        stop_order: idx + 1,
        travel_mins_from_prev: tMins,
        distance_meters_from_prev: dist,
        arrival_time: arr,
        departure_time: dep,
        is_open_at_arrival: openInfo.isOpen,
        open_status_note: openInfo.note,
      };
    });

    const updatedPlan: ItineraryPlan = {
      ...activePlan,
      stops: recalculatedStops,
      total_travel_mins: totalTravel,
      total_distance_meters: totalDist,
      total_duration_mins: totalTravel + totalStay,
      google_maps_nav_url: buildGoogleMapsDirUrl(
        activePlan.origin,
        recalculatedStops.map((s) => s.place),
        activePlan.travel_mode
      ),
    };

    setPlans((prev) =>
      prev.map((pl, idx) => (idx === activePlanIndex ? updatedPlan : pl))
    );
  };

  /**
   * 1-Tap Swap Stop on Timeline ("🔄 換一家同類型的店")
   */
  const handleSwapStopWithAlternative = (
    stopIndex: number,
    replacementPlace: SavedPlace
  ) => {
    if (!activePlan) return;
    const currentStop = activePlan.stops[stopIndex];
    const oldPlace = currentStop.place;

    // Build updated alternatives list (include the old place so user can swap back!)
    const nextAlternatives = [
      {
        place: oldPlace,
        distance_from_prev_meters: currentStop.distance_meters_from_prev,
        travel_mins_from_prev: currentStop.travel_mins_from_prev,
        open_status_note: '原排程店家（可隨時換回）',
      },
      ...currentStop.alternatives.filter(
        (alt) => alt.place.id !== replacementPlace.id
      ),
    ];

    const nextStops = activePlan.stops.map((st, idx) =>
      idx === stopIndex
        ? {
            ...st,
            place: replacementPlace,
            stay_mins: replacementPlace.estimated_stay_mins || st.stay_mins,
            ai_reason: `已由您手動替換為同類別備選「${replacementPlace.name}」，系統已即時重算後續各站抵達時間與導航動線。`,
            alternatives: nextAlternatives,
          }
        : st
    );

    recalculateActivePlanStops(nextStops);
    setOpenSwapStopIndex(null);
  };

  /**
   * Move stop up or down on the timeline
   */
  const handleMoveStop = (stopIndex: number, direction: -1 | 1) => {
    if (!activePlan) return;
    const targetIndex = stopIndex + direction;
    if (targetIndex < 0 || targetIndex >= activePlan.stops.length) return;
    const copy = [...activePlan.stops];
    const [moved] = copy.splice(stopIndex, 1);
    copy.splice(targetIndex, 0, moved);
    recalculateActivePlanStops(copy);
  };

  /**
   * Adjust stay duration on the timeline AND sync back to saved place
   */
  const handleAdjustStopStay = (stopIndex: number, deltaMins: number) => {
    if (!activePlan) return;
    const targetStop = activePlan.stops[stopIndex];
    const nextStay = Math.max(15, Math.min(360, targetStop.stay_mins + deltaMins));
    updatePlaceInline(targetStop.place.id, { estimated_stay_mins: nextStay });

    const nextStops = activePlan.stops.map((st, idx) =>
      idx === stopIndex ? { ...st, stay_mins: nextStay } : st
    );
    recalculateActivePlanStops(nextStops);
  };

  /**
   * 1-Tap Check-In on Timeline ("✅ 打卡完畢：去過想再去 / 去過不推")
   */
  const handleTimelineCheckIn = (
    stopIndex: number,
    newStatus: VisitStatus
  ) => {
    if (!activePlan) return;
    const targetStop = activePlan.stops[stopIndex];
    updatePlaceInline(targetStop.place.id, { visit_status: newStatus });

    const nextStops = activePlan.stops.map((st, idx) =>
      idx === stopIndex
        ? {
            ...st,
            place: { ...st.place, visit_status: newStatus },
          }
        : st
    );
    setPlans((prev) =>
      prev.map((pl, idx) =>
        idx === activePlanIndex ? { ...pl, stops: nextStops } : pl
      )
    );
  };

  const handleUseBrowserGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('您的瀏覽器不支援 GPS 定位，已使用預設座標');
      return;
    }
    setGpsStatus('正在讀取手機 GPS 定位...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const nextOrigin = {
          name: `手機目前 GPS (${pos.coords.latitude.toFixed(
            4
          )}, ${pos.coords.longitude.toFixed(4)})`,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        setOrigin(nextOrigin);
        setSelectedPresetId('custom-gps');
        setGpsStatus('已更新為您目前的真實 GPS 座標！');
        handleGenerateItinerary(nextOrigin);
      },
      () => {
        setGpsStatus(
          '無法取得 GPS 權限，您可以直接點選上方「高雄・鹽埕區 / 台北・大稻埕 / 東京・淺草」快速切換測試座標'
        );
      },
      { timeout: 6000 }
    );
  };

  return (
    <div className="space-y-6">
      {/* Step 1 & Step 2 Control Panel */}
      <section className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 shadow-2xs space-y-5">
        {/* Destination / GPS Switcher */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-stone-100">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
              STEP 1｜當下出發情境設定
            </span>
            <h2 className="text-base sm:text-lg font-bold text-stone-900 mt-0.5">
              您現在人在哪裡？準備怎麼移動？
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {PRESET_DESTINATIONS.map((dest) => (
              <button
                key={dest.id}
                type="button"
                onClick={() => {
                  setSelectedPresetId(dest.id);
                  const nextOrig = {
                    name: dest.label,
                    latitude: dest.latitude,
                    longitude: dest.longitude,
                  };
                  setOrigin(nextOrig);
                  const cityPrompt =
                    dest.city === '台北市'
                      ? '我們現在在大稻埕，想先逛個沒去過的美術館，接著吃正餐，喝個下午茶甜點，最後買伴手禮'
                      : dest.city === '東京都'
                      ? '現在在東京淺草雷門，想先去沒去過的文化展館，中午吃壽喜燒正餐，接著吃布丁點心，最後買銅鑼燒伴手禮'
                      : '我們現在在鹽埕區，想找沒去過的展覽館逛一下，晚餐吃附近收藏的正餐，接著吃個點心，最後順路買個伴手禮回飯店';
                  setIntentText(cityPrompt);
                  handleGenerateItinerary(nextOrig, cityPrompt);
                }}
                className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  selectedPresetId === dest.id
                    ? 'bg-stone-900 text-white shadow-2xs'
                    : 'border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                }`}
              >
                📍 {dest.shortLabel}
              </button>
            ))}

            <button
              type="button"
              onClick={handleUseBrowserGps}
              className="inline-flex items-center gap-1.5 rounded-xl border border-teal-300 bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-900 hover:bg-teal-100 transition-colors cursor-pointer"
            >
              <LocateFixed className="h-3.5 w-3.5 text-teal-700" />
              讀取手機 GPS
            </button>
          </div>
        </div>

        {gpsStatus && (
          <div className="rounded-lg bg-teal-50 border border-teal-200 px-3 py-1.5 text-xs text-teal-900">
            {gpsStatus}
          </div>
        )}

        {/* Departure Time, Travel Mode, Radius */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
            <label className="block text-xs font-semibold text-stone-600 mb-1">
              🕒 預計出發時間（系統將檢查抵達時是否營業）
            </label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-bold text-stone-900"
            />
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
            <label className="block text-xs font-semibold text-stone-600 mb-1">
              🚶 移動方式（計算點對點路網時間）
            </label>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-stone-200/70 p-1">
              {(
                [
                  { mode: 'WALK', label: '🚶 步行' },
                  { mode: 'TRANSIT', label: '🚇 大眾運輸' },
                  { mode: 'DRIVE', label: '🚗 開車/騎車' },
                ] as Array<{ mode: TravelMode; label: string }>
              ).map((m) => (
                <button
                  key={m.mode}
                  type="button"
                  onClick={() => setTravelMode(m.mode)}
                  className={`rounded-md py-1 text-xs font-semibold transition-all cursor-pointer ${
                    travelMode === m.mode
                      ? 'bg-stone-900 text-white shadow-2xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
            <div className="flex items-center justify-between text-xs font-semibold text-stone-600 mb-1">
              <span>📡 PostGIS 周邊搜尋半徑</span>
              <span className="text-amber-700 font-bold">
                {(radiusMeters / 1000).toFixed(1)} km（入圍 {nearbyCandidates.length}{' '}
                點）
              </span>
            </div>
            <input
              type="range"
              min={1500}
              max={15000}
              step={500}
              value={radiusMeters}
              onChange={(e) => setRadiusMeters(Number(e.target.value))}
              className="w-full accent-amber-600 cursor-pointer mt-1.5"
            />
          </div>
        </div>

        {/* Step 2: Sequence Block Builder + Natural Language Intent */}
        <div className="pt-2 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-amber-700">
                STEP 2｜積木式順序組裝器 ＋ 自然語言當下想法
              </span>
              <p className="text-xs text-stone-500">
                點擊積木可切換「僅限沒去過🌟」或移除，也可從右側加入新站點；伴手禮會自動優先排在最後一站
              </p>
            </div>

            {/* Quick Add Block Dropdown */}
            <div className="flex items-center gap-1.5">
              <select
                aria-label="新增行程積木"
                onChange={(e) => {
                  const sub = e.target.value;
                  if (!sub) return;
                  const cfg = categoryConfigs.find((c) => c.sub_category === sub);
                  if (cfg) {
                    setIntentBlocks((prev) => [
                      ...prev,
                      {
                        id: `blk-${Date.now()}`,
                        label: `${cfg.primary_label.slice(0, 2)}：${cfg.sub_label}`,
                        primary_category: cfg.primary_category,
                        sub_category: cfg.sub_category,
                        only_unvisited: false,
                      },
                    ]);
                  }
                  e.target.value = '';
                }}
                defaultValue=""
                className="rounded-lg border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs font-medium text-stone-700 cursor-pointer"
              >
                <option value="" disabled>
                  ＋ 加入一站積木...
                </option>
                {categoryConfigs.map((cfg) => (
                  <option key={cfg.id} value={cfg.sub_category}>
                    ＋ {cfg.primary_label}：{cfg.sub_label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Interactive Sequence Blocks */}
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
            {intentBlocks.map((blk, idx) => (
              <React.Fragment key={blk.id}>
                <div className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 shadow-2xs">
                  <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-stone-900 text-[10px] text-white">
                    {idx + 1}
                  </span>
                  <button
                    type="button"
                    title="點擊切換：是否只選『沒去過』的店"
                    onClick={() =>
                      setIntentBlocks((prev) =>
                        prev.map((b, i) =>
                          i === idx
                            ? { ...b, only_unvisited: !b.only_unvisited }
                            : b
                        )
                      )
                    }
                    className={`rounded px-1.5 py-0.5 text-[11px] transition-colors cursor-pointer ${
                      blk.only_unvisited
                        ? 'bg-emerald-100 text-emerald-900 font-bold'
                        : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {blk.only_unvisited ? '🌟 必選沒去過' : '不限狀態'}
                  </button>
                  <span>{blk.label}</span>
                  {intentBlocks.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setIntentBlocks((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                      className="text-stone-400 hover:text-red-600 cursor-pointer ml-1"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {idx < intentBlocks.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-stone-400 shrink-0" />
                )}
              </React.Fragment>
            ))}
          </div>

          {/* Natural Language Input + Action Button */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={intentText}
              onChange={(e) => setIntentText(e.target.value)}
              placeholder="輸入當下自然語言想法，例如：下午想先去一個沒去過的博物館，接著吃個點心，最後買伴手禮..."
              className="flex-1 rounded-xl border border-stone-300 bg-stone-50/70 px-3.5 py-2.5 text-sm text-stone-900 focus:border-amber-600 focus:bg-white focus:outline-none"
            />
            <button
              id="btn-generate-itinerary"
              type="button"
              disabled={isGenerating}
              onClick={async () => {
                await refreshPlacesHours(nearbyCandidates);
                await handleGenerateItinerary();
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50 transition-all cursor-pointer shrink-0 shadow-xs"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  檢查營業狀態與排程中...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  依想法串聯最佳動線
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMsg}
        </div>
      )}

      {/* Results: Plan Switcher + Map + Interactive Timeline */}
      {activePlan && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Timeline & Live Controls (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            {/* Plan Tabs (Plan A / Plan B) */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                {plans.map((pl, idx) => (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => {
                      setActivePlanIndex(idx);
                      setOpenSwapStopIndex(null);
                    }}
                    className={`rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                      activePlanIndex === idx
                        ? 'bg-stone-900 text-white shadow-sm'
                        : 'border border-stone-200 bg-white text-stone-600 hover:bg-stone-100'
                    }`}
                  >
                    {pl.title}
                  </button>
                ))}
              </div>

              <span className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg font-medium">
                ✓ 已即時檢查周邊 {activePlan.refreshed_candidates_count} 間店營業狀態
              </span>
            </div>

            {/* Summary Header Card */}
            <div className="rounded-2xl border border-stone-200 bg-white p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div>
                <h3 className="text-base font-bold text-stone-900">
                  {activePlan.title}
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">
                  總時長約 {Math.floor(activePlan.total_duration_mins / 60)} 小時{' '}
                  {activePlan.total_duration_mins % 60} 分（含總移動{' '}
                  {activePlan.total_travel_mins} 分鐘／總路程{' '}
                  {(activePlan.total_distance_meters / 1000).toFixed(2)} km）
                </p>
              </div>
              <a
                id="btn-open-google-maps-nav"
                href={activePlan.google_maps_nav_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-teal-800 transition-colors shrink-0 shadow-2xs"
              >
                <Navigation className="h-4 w-4" />
                一鍵開啟全路線導航
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            {/* Vertical Interactive Timeline */}
            <div className="space-y-3 relative">
              {activePlan.stops.map((stop, idx) => {
                const isSwapOpen = openSwapStopIndex === idx;
                return (
                  <div
                    key={`${stop.place.id}-${idx}`}
                    className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs transition-all"
                  >
                    {/* Travel Connector Banner from Previous Stop */}
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-stone-100 text-xs text-stone-500">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-amber-600 text-white font-bold text-xs">
                          {stop.stop_order}
                        </span>
                        <span className="font-bold text-stone-900 text-sm">
                          {stop.arrival_time} – {stop.departure_time}
                        </span>
                        <span className="text-stone-400">｜</span>
                        <span>
                          距上一站 {stop.distance_meters_from_prev}m（約{' '}
                          {stop.travel_mins_from_prev} 分鐘）
                        </span>
                      </div>

                      {/* Reorder & Stay Duration Controls */}
                      <div className="flex items-center gap-1">
                        <div className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px]">
                          <Clock className="h-3 w-3 text-stone-500" />
                          <button
                            type="button"
                            onClick={() => handleAdjustStopStay(idx, -15)}
                            className="font-bold px-1 hover:text-stone-900 cursor-pointer"
                          >
                            -
                          </button>
                          <span className="font-semibold text-stone-800">
                            停留 {stop.stay_mins}分
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAdjustStopStay(idx, 15)}
                            className="font-bold px-1 hover:text-stone-900 cursor-pointer"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveStop(idx, -1)}
                          title="上移一站"
                          className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === activePlan.stops.length - 1}
                          onClick={() => handleMoveStop(idx, 1)}
                          title="下移一站"
                          className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-800 disabled:opacity-30 cursor-pointer"
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Main Stop Content */}
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-bold text-stone-900">
                            {stop.place.name}
                          </h4>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                              stop.is_open_at_arrival
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}
                          >
                            {stop.open_status_note}
                          </span>
                        </div>
                        <p className="text-xs text-stone-500">
                          {stop.place.formatted_address}
                        </p>
                        <p className="text-xs text-amber-900 bg-amber-50/70 rounded-lg px-2.5 py-1.5 mt-1.5">
                          💡 <strong>AI 排程理由：</strong>
                          {stop.ai_reason}
                        </p>
                        {stop.place.user_notes && (
                          <p className="text-xs text-stone-600 pt-1">
                            📝 收藏筆記：{stop.place.user_notes}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Live On-the-Go Action Bar: Check-In & 1-Tap Swap */}
                    <div className="mt-3.5 pt-3 border-t border-stone-100 flex flex-wrap items-center justify-between gap-2">
                      {/* 1-Tap Check-In synced with Places Collection */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-semibold text-stone-500 mr-1">
                          現場打卡同步更新：
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleTimelineCheckIn(idx, 'visited_revisit')
                          }
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                            stop.place.visit_status === 'visited_revisit'
                              ? 'bg-amber-700 text-white shadow-2xs'
                              : 'border border-stone-200 bg-stone-50 text-stone-700 hover:bg-amber-50'
                          }`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          ❤️ 逛完・想再去
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleTimelineCheckIn(idx, 'visited_skip')
                          }
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                            stop.place.visit_status === 'visited_skip'
                              ? 'bg-stone-800 text-white shadow-2xs'
                              : 'border border-stone-200 bg-stone-50 text-stone-600 hover:bg-stone-200/60'
                          }`}
                        >
                          🚫 逛完・下次不推
                        </button>
                      </div>

                      {/* 1-Tap Swap Same-Category Stop Button */}
                      <button
                        type="button"
                        onClick={() =>
                          setOpenSwapStopIndex(isSwapOpen ? null : idx)
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50/70 px-3 py-1 text-xs font-semibold text-teal-900 hover:bg-teal-100 transition-colors cursor-pointer"
                      >
                        <Repeat className="h-3.5 w-3.5 text-teal-700" />
                        換一家同類型的店 ({stop.alternatives.length} 間備選)
                      </button>
                    </div>

                    {/* Expandable Same-Category Alternatives Drawer */}
                    {isSwapOpen && (
                      <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50/40 p-3 space-y-2">
                        <div className="flex items-center justify-between text-xs font-semibold text-teal-950">
                          <span>
                            🔄 選擇周邊同類型備選店家（點擊立即替換本站並重算時間軸）：
                          </span>
                          <button
                            type="button"
                            onClick={() => setOpenSwapStopIndex(null)}
                            className="text-stone-400 hover:text-stone-700 cursor-pointer"
                          >
                            關閉
                          </button>
                        </div>

                        {stop.alternatives.length === 0 ? (
                          <p className="text-xs text-stone-500">
                            目前半徑內沒有其他同子分類的備選店家，您可調大搜尋半徑或至景點庫新增。
                          </p>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {stop.alternatives.map((alt) => (
                              <button
                                key={alt.place.id}
                                type="button"
                                onClick={() =>
                                  handleSwapStopWithAlternative(idx, alt.place)
                                }
                                className="flex flex-col justify-between text-left rounded-lg border border-teal-200/80 bg-white p-2.5 hover:border-teal-600 hover:shadow-xs transition-all cursor-pointer"
                              >
                                <div>
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-bold text-xs text-stone-900">
                                      {alt.place.name}
                                    </span>
                                    <span className="text-[11px] font-semibold text-teal-700">
                                      換這家 ➔
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-stone-500 mt-0.5 line-clamp-1">
                                    距上一站 {alt.distance_from_prev_meters}m（約{' '}
                                    {alt.travel_mins_from_prev} 分）｜
                                    {alt.open_status_note}
                                  </p>
                                </div>
                                {alt.place.user_notes && (
                                  <p className="text-[11px] text-stone-600 mt-1 line-clamp-1">
                                    📝 {alt.place.user_notes}
                                  </p>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Spatial Route Visualizer Map + Excluded Closed/Skip Notice (5 cols) */}
          <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-20">
            <RouteVisualizerMap
              origin={activePlan.origin}
              candidates={nearbyCandidates}
              activePlan={activePlan}
            />

            {/* Automatically Excluded Places Audit Box */}
            {activePlan.excluded_closed_places.length > 0 && (
              <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
                <div className="flex items-center gap-2 text-xs font-bold text-stone-800 mb-2">
                  <ShieldAlert className="h-4 w-4 text-amber-600" />
                  排程引擎已自動為您排除以下不適合店家：
                </div>
                <ul className="space-y-1.5 text-xs text-stone-600">
                  {activePlan.excluded_closed_places.map((ex, i) => (
                    <li
                      key={`${ex.name}-${i}`}
                      className="flex items-center justify-between rounded-lg bg-stone-50 px-2.5 py-1.5"
                    >
                      <span className="font-medium text-stone-800">
                        {ex.name}
                      </span>
                      <span className="text-[11px] text-stone-500">
                        {ex.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
