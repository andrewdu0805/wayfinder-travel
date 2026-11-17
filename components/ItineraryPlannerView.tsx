'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Clock,
  ExternalLink,
  Loader2,
  Navigation,
  Repeat,
  RotateCcw,
  Sparkles,
  Train,
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
    label: '🏛️ 沒去過的展館',
    primary_category: 'museum_culture',
    sub_category: 'museum',
    only_unvisited: true,
  },
  {
    id: 'blk-2',
    label: '🍴 餐廳：正餐',
    primary_category: 'restaurant',
    sub_category: 'meal',
    only_unvisited: false,
  },
  {
    id: 'blk-3',
    label: '☕ 餐廳：點心',
    primary_category: 'restaurant',
    sub_category: 'snack_dessert',
    only_unvisited: false,
  },
  {
    id: 'blk-4',
    label: '🎁 餐廳：伴手禮',
    primary_category: 'restaurant',
    sub_category: 'souvenir',
    only_unvisited: false,
  },
];

const QUICK_DIALOG_PRESETS = [
  {
    badge: '🚄 範例 1：10:30 到台南・16:30 搭高鐵（機車）',
    text: '我 10:30 到台南，16:30 要坐高鐵回程，交通工具是機車，幫我安排順路行程',
    destId: 'tainan-westcentral',
    start: '10:30',
    dep: '16:30',
    mode: 'SCOOTER' as TravelMode,
  },
  {
    badge: '🚆 範例 2：11:00 到台南・14:50 搭火車（緊湊自動濃縮）',
    text: '今天 11:00 到台南，14:50 要搭火車離開，交通工具是機車',
    destId: 'tainan-westcentral',
    start: '11:00',
    dep: '14:50',
    mode: 'SCOOTER' as TravelMode,
  },
  {
    badge: '🏨 範例 3：今晚住台南大飯店（最後一站回飯店旁）',
    text: '今天 10:00 出發，晚上住在台南大飯店，幫我安排今天白天在台南的行程，交通工具是機車',
    destId: 'tainan-westcentral',
    start: '10:00',
    dep: '',
    mode: 'SCOOTER' as TravelMode,
  },
  {
    badge: '🚶 範例 4：台南中西區・步行慢遊（近距離不鐵腿）',
    text: '明天 10:30 要去台南旅遊，大概都是在中西區活動，交通工具是步行，所以安排近一點的地點。',
    destId: 'tainan-westcentral',
    start: '10:30',
    dep: '',
    mode: 'WALK' as TravelMode,
  },
  {
    badge: '🦆 範例 5：高雄鹽埕區・指定中餐吃鴨肉珍',
    text: '我明天 10:30 要去高雄，幫我安排鹽埕區之旅，不過指定中餐要在鴨肉珍吃',
    destId: 'kaohsiung-yancheng',
    start: '10:30',
    dep: '',
    mode: 'WALK' as TravelMode,
  },
];

export function ItineraryPlannerView() {
  const { places, updatePlaceInline } = usePlaces();

  const [selectedPresetId, setSelectedPresetId] = useState(
    PRESET_DESTINATIONS[0].id
  );
  const [origin, setOrigin] = useState({
    name: PRESET_DESTINATIONS[0].label,
    latitude: PRESET_DESTINATIONS[0].latitude,
    longitude: PRESET_DESTINATIONS[0].longitude,
  });
  const [startTime, setStartTime] = useState('10:30');
  const [returnDepartureTime, setReturnDepartureTime] = useState('16:30');
  const [travelMode, setTravelMode] = useState<TravelMode>('SCOOTER');
  const [intentText, setIntentText] = useState(
    '我 10:30 到台南，16:30 要坐高鐵回程，交通工具是機車，幫我安排順路行程'
  );
  const [sessionSkippedIds, setSessionSkippedIds] = useState<string[]>([]);

  const [plans, setPlans] = useState<ItineraryPlan[]>([]);
  const [activePlanIndex, setActivePlanIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [openSwapStopIndex, setOpenSwapStopIndex] = useState<number | null>(
    null
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activePlan = plans[activePlanIndex] || null;

  const handleGenerateItinerary = useCallback(
    async (opts?: {
      overrideOrigin?: { name: string; latitude: number; longitude: number };
      overrideText?: string;
      overrideMode?: TravelMode;
      overrideStart?: string;
      overrideDep?: string;
      overrideSkipped?: string[];
    }) => {
      setIsGenerating(true);
      setErrorMsg(null);
      setOpenSwapStopIndex(null);

      const textToUse = opts?.overrideText ?? intentText;
      let targetOrigin = opts?.overrideOrigin || origin;

      // Auto-detect city from prompt text
      if (!opts?.overrideOrigin) {
        if (/高雄|鹽埕|駁二|鴨肉珍/.test(textToUse)) {
          const kh = PRESET_DESTINATIONS.find((d) => d.city === '高雄市');
          if (kh) {
            targetOrigin = {
              name: kh.label,
              latitude: kh.latitude,
              longitude: kh.longitude,
            };
            setSelectedPresetId(kh.id);
            setOrigin(targetOrigin);
          }
        } else if (/台南|臺南|中西區|安平/.test(textToUse)) {
          const tn = PRESET_DESTINATIONS.find((d) => d.city === '台南市');
          if (tn) {
            targetOrigin = {
              name: tn.label,
              latitude: tn.latitude,
              longitude: tn.longitude,
            };
            setSelectedPresetId(tn.id);
            setOrigin(targetOrigin);
          }
        } else if (/台北|大稻埕|迪化街/.test(textToUse)) {
          const tp = PRESET_DESTINATIONS.find((d) => d.city === '台北市');
          if (tp) {
            targetOrigin = {
              name: tp.label,
              latitude: tp.latitude,
              longitude: tp.longitude,
            };
            setSelectedPresetId(tp.id);
            setOrigin(targetOrigin);
          }
        } else if (/東京|淺草|雷門/.test(textToUse)) {
          const tyo = PRESET_DESTINATIONS.find((d) => d.city === '東京都');
          if (tyo) {
            targetOrigin = {
              name: tyo.label,
              latitude: tyo.latitude,
              longitude: tyo.longitude,
            };
            setSelectedPresetId(tyo.id);
            setOrigin(targetOrigin);
          }
        }
      }

      const modeToUse = opts?.overrideMode ?? travelMode;
      const startToUse = opts?.overrideStart ?? startTime;
      const depToUse =
        opts?.overrideDep !== undefined
          ? opts.overrideDep
          : returnDepartureTime;
      const skippedToUse = opts?.overrideSkipped ?? sessionSkippedIds;

      const filteredPlaces = places.filter(
        (p) => !skippedToUse.includes(p.id)
      );

      try {
        const res = await fetch('/api/chain-itinerary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            places: filteredPlaces,
            origin: targetOrigin,
            radiusMeters: modeToUse === 'WALK' ? 2200 : 9000,
            startTime: startToUse,
            returnDepartureTime: depToUse || undefined,
            travelMode: modeToUse,
            intentText: textToUse,
            intentBlocks: DEFAULT_BLOCKS,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.plans || data.plans.length === 0) {
          throw new Error(
            data.error || '找不到符合條件的順路行程，請調整條件後再試'
          );
        }
        setPlans(data.plans);
        setActivePlanIndex(0);
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : '行程運算失敗'
        );
      } finally {
        setIsGenerating(false);
      }
    },
    [
      intentText,
      origin,
      travelMode,
      startTime,
      returnDepartureTime,
      sessionSkippedIds,
      places,
    ]
  );

  useEffect(() => {
    if (places.length > 0 && plans.length === 0) {
      handleGenerateItinerary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const handleSwapStopWithAlternative = (
    stopIndex: number,
    replacementPlace: SavedPlace
  ) => {
    if (!activePlan) return;
    const currentStop = activePlan.stops[stopIndex];
    const oldPlace = currentStop.place;

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
            ai_reason: `🔀 已替換為順路同類型店家「${replacementPlace.name}」！`,
            alternatives: nextAlternatives,
          }
        : st
    );

    recalculateActivePlanStops(nextStops);
    setOpenSwapStopIndex(null);
  };

  const handleQuickRejectAndSwap = (stopIndex: number) => {
    if (!activePlan) return;
    const currentStop = activePlan.stops[stopIndex];
    const rejectedId = currentStop.place.id;
    const nextSkipped = [...sessionSkippedIds, rejectedId];
    setSessionSkippedIds(nextSkipped);

    if (currentStop.alternatives.length > 0) {
      handleSwapStopWithAlternative(
        stopIndex,
        currentStop.alternatives[0].place
      );
    } else {
      handleGenerateItinerary({ overrideSkipped: nextSkipped });
    }
  };

  const handleRemoveStop = (stopIndex: number) => {
    if (!activePlan || activePlan.stops.length <= 1) return;
    const nextStops = activePlan.stops.filter((_, idx) => idx !== stopIndex);
    recalculateActivePlanStops(nextStops);
  };

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

  return (
    <div className="space-y-6">
      {/* ==================== 大字版 AI 排程對話窗 ==================== */}
      <section className="rounded-3xl border-2 border-amber-400/80 bg-white p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-xs">
              <Sparkles className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-xl sm:text-2xl font-extrabold text-stone-900">
                🗣️ 直接用說的排行程（支援指定時間、交通工具、高鐵／火車／飯店）
              </h2>
            </div>
          </div>

          {sessionSkippedIds.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setSessionSkippedIds([]);
                handleGenerateItinerary({ overrideSkipped: [] });
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-100 px-3.5 py-2 text-base font-bold text-stone-700 hover:bg-stone-200 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              復原換掉的店 ({sessionSkippedIds.length})
            </button>
          )}
        </div>

        {/* 超大對話輸入框 */}
        <div className="space-y-3">
          <textarea
            id="planner-large-dialog"
            rows={3}
            value={intentText}
            onChange={(e) => setIntentText(e.target.value)}
            placeholder="請直接輸入您的旅遊計畫，例如：&#10;「我明天 10:30 到台南，16:30 要坐高鐵回程，交通工具是機車，中餐想吃六千牛肉湯」"
            className="w-full rounded-2xl border-2 border-stone-300 bg-stone-50/70 p-4 text-lg sm:text-xl font-bold text-stone-900 placeholder:text-stone-400 focus:border-amber-600 focus:bg-white focus:outline-none leading-relaxed"
          />

          {/* 抵達時間、回程時間、交通工具 與 開始排程大按鈕 */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-stone-100/90 p-3.5 border border-stone-200">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-base font-extrabold text-stone-800">
                <span>🛬 抵達：</span>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="rounded-xl border-2 border-stone-300 bg-white px-3 py-1.5 text-base sm:text-lg font-extrabold text-stone-900"
                />
              </label>

              <label className="flex items-center gap-2 text-base font-extrabold text-stone-800">
                <span>🚄 回程搭車：</span>
                <input
                  type="time"
                  value={returnDepartureTime}
                  onChange={(e) => setReturnDepartureTime(e.target.value)}
                  className="rounded-xl border-2 border-rose-300 bg-white px-3 py-1.5 text-base sm:text-lg font-extrabold text-rose-900"
                />
              </label>

              <div className="inline-flex rounded-xl border border-stone-300 bg-white p-1 gap-1">
                {(
                  [
                    { mode: 'WALK', label: '🚶 步行' },
                    { mode: 'SCOOTER', label: '🛵 機車' },
                    { mode: 'DRIVE', label: '🚗 開車' },
                  ] as Array<{ mode: TravelMode; label: string }>
                ).map((m) => (
                  <button
                    key={m.mode}
                    type="button"
                    onClick={() => {
                      setTravelMode(m.mode);
                      handleGenerateItinerary({ overrideMode: m.mode });
                    }}
                    className={`rounded-lg px-3.5 py-1.5 text-base font-extrabold transition-all cursor-pointer ${
                      travelMode === m.mode
                        ? 'bg-stone-900 text-white'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              id="btn-generate-itinerary"
              type="button"
              disabled={isGenerating}
              onClick={() => handleGenerateItinerary()}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-600 px-7 py-3.5 text-lg font-extrabold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  正在安排順路行程...
                </>
              ) : (
                <>
                  <Sparkles className="h-5 w-5" />
                  ✨ 立即安排順路行程
                </>
              )}
            </button>
          </div>
        </div>

        {/* 一鍵帶入範例（大字膠囊） */}
        <div className="space-y-2">
          <div className="text-sm sm:text-base font-extrabold text-stone-500">
            💡 點擊下方範例可直接測試不同情境：
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_DIALOG_PRESETS.map((preset, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setIntentText(preset.text);
                  setStartTime(preset.start);
                  setReturnDepartureTime(preset.dep);
                  setTravelMode(preset.mode);
                  const foundDest = PRESET_DESTINATIONS.find(
                    (d) => d.id === preset.destId
                  );
                  const nextOrig = foundDest
                    ? {
                        name: foundDest.label,
                        latitude: foundDest.latitude,
                        longitude: foundDest.longitude,
                      }
                    : origin;
                  if (foundDest) {
                    setSelectedPresetId(foundDest.id);
                    setOrigin(nextOrig);
                  }
                  handleGenerateItinerary({
                    overrideOrigin: nextOrig,
                    overrideText: preset.text,
                    overrideMode: preset.mode,
                    overrideStart: preset.start,
                    overrideDep: preset.dep,
                  });
                }}
                className={`rounded-xl border px-3.5 py-2 text-sm sm:text-base font-bold transition-all cursor-pointer text-left ${
                  intentText === preset.text
                    ? 'border-amber-600 bg-amber-50 text-amber-950 font-extrabold'
                    : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                }`}
              >
                {preset.badge}
              </button>
            ))}
          </div>
        </div>
      </section>

      {errorMsg && (
        <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-base font-bold text-red-700">
          {errorMsg}
        </div>
      )}

      {/* ==================== 排程結果：互動地圖 ＋ 大字時間軸 ==================== */}
      {activePlan && (
        <section className="space-y-5">
          {/* 方案切換 ＋ 時刻狀態摘要 ＋ Google Maps 導航大按鈕 */}
          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {plans.map((pl, idx) => (
                  <button
                    key={pl.id}
                    type="button"
                    onClick={() => {
                      setActivePlanIndex(idx);
                      setOpenSwapStopIndex(null);
                    }}
                    className={`rounded-xl px-4 py-2.5 text-base sm:text-lg font-extrabold transition-all cursor-pointer ${
                      activePlanIndex === idx
                        ? 'bg-stone-900 text-white shadow-xs'
                        : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                    }`}
                  >
                    {pl.title}
                  </button>
                ))}
              </div>

              <a
                href={activePlan.google_maps_nav_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-5 py-3 text-base sm:text-lg font-extrabold text-white shadow-xs hover:bg-teal-800 transition-colors"
              >
                <Navigation className="h-5 w-5" />
                開啟 Google Maps 全程導航
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>

            {activePlan.time_fit_note && (
              <div className="rounded-xl border-2 border-teal-300 bg-teal-50/80 px-4 py-3 text-base sm:text-lg font-extrabold text-teal-950 flex flex-wrap items-center justify-between gap-2">
                <span>{activePlan.time_fit_note}</span>
                {activePlan.must_arrive_by && (
                  <span className="rounded-lg bg-rose-100 border border-rose-300 px-3 py-1 text-sm sm:text-base font-extrabold text-rose-900">
                    🎯 最晚進站還車：{activePlan.must_arrive_by}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* 雙欄排版：左邊地圖、右邊大字時間軸 */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* 左欄：路線視覺化地圖 */}
            <div className="lg:col-span-5 lg:sticky lg:top-36">
              <RouteVisualizerMap
                origin={activePlan.origin}
                candidates={places.filter(
                  (p) => p.city === PRESET_DESTINATIONS.find((d) => d.id === selectedPresetId)?.city
                )}
                activePlan={activePlan}
              />
            </div>

            {/* 右欄：大字精簡時間軸 */}
            <div className="lg:col-span-7 space-y-4">
              {activePlan.stops.map((stop, idx) => (
                <div
                  key={`${stop.place.id}-${idx}`}
                  className="rounded-2xl border-2 border-stone-200 bg-white p-5 shadow-xs space-y-4"
                >
                  {/* 第一排：第幾站 ＋ 時間 ＋ 店名 */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="rounded-xl bg-amber-600 px-3.5 py-1 text-base font-extrabold text-white">
                        第 {stop.stop_order} 站・{stop.place.district}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-xl bg-stone-100 px-3 py-1 text-base sm:text-lg font-extrabold text-stone-900">
                        <Clock className="h-4 w-4 text-amber-700" />
                        {stop.arrival_time} – {stop.departure_time}
                      </span>
                    </div>

                    <span className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1 text-sm sm:text-base font-extrabold text-emerald-800">
                      距離 {stop.distance_meters_from_prev}m（移動 {stop.travel_mins_from_prev} 分・停留 {stop.stay_mins} 分）
                    </span>
                  </div>

                  {/* 第二排：超大店名 */}
                  <div>
                    <h3 className="text-xl sm:text-2xl font-extrabold text-stone-900">
                      {stop.place.name}
                    </h3>
                    {stop.place.user_notes && (
                      <p className="text-base text-stone-600 mt-1 font-medium">
                        📝 {stop.place.user_notes}
                      </p>
                    )}
                  </div>

                  {/* 第三排：順路原因 */}
                  <div className="rounded-xl bg-amber-50/70 border border-amber-200/80 px-4 py-2.5 text-base font-bold text-stone-800">
                    {stop.ai_reason}
                  </div>

                  {/* 第四排：大按鈕操作列（秒換下一間 ／ 自選清單 ／ 打卡） */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-100">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleQuickRejectAndSwap(idx)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-base font-extrabold text-white hover:bg-amber-700 transition-colors cursor-pointer"
                      >
                        🔀 不想去這家・秒換下一間
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setOpenSwapStopIndex(
                            openSwapStopIndex === idx ? null : idx
                          )
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl border-2 border-teal-600 bg-teal-50 px-4 py-2 text-base font-extrabold text-teal-900 hover:bg-teal-100 transition-colors cursor-pointer"
                      >
                        <Repeat className="h-4 w-4" />
                        自選清單 ({stop.alternatives.length})
                      </button>

                      {activePlan.stops.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveStop(idx)}
                          className="inline-flex items-center gap-1 rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2 text-base font-bold text-stone-600 hover:bg-stone-100 cursor-pointer"
                        >
                          <X className="h-4 w-4" />
                          略過
                        </button>
                      )}
                    </div>

                    <div className="inline-flex rounded-xl bg-stone-100 p-1 gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          handleTimelineCheckIn(idx, 'visited_revisit')
                        }
                        className={`rounded-lg px-3 py-1.5 text-sm sm:text-base font-extrabold cursor-pointer ${
                          stop.place.visit_status === 'visited_revisit'
                            ? 'bg-amber-600 text-white'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        ❤️ 想再去
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleTimelineCheckIn(idx, 'visited_skip')
                        }
                        className={`rounded-lg px-3 py-1.5 text-sm sm:text-base font-extrabold cursor-pointer ${
                          stop.place.visit_status === 'visited_skip'
                            ? 'bg-stone-700 text-white'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        🚫 不推
                      </button>
                    </div>
                  </div>

                  {/* 展開的自選同類型備選清單 */}
                  {openSwapStopIndex === idx && (
                    <div className="rounded-xl border-2 border-teal-300 bg-teal-50/50 p-4 space-y-2.5">
                      <div className="text-base font-extrabold text-teal-950">
                        點選下方同類型店家即可立即替換：
                      </div>
                      {stop.alternatives.length === 0 ? (
                        <div className="text-base text-stone-500">
                          附近無其他同分類備選店家
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {stop.alternatives.map((alt) => (
                            <button
                              key={alt.place.id}
                              type="button"
                              onClick={() =>
                                handleSwapStopWithAlternative(idx, alt.place)
                              }
                              className="w-full flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 text-left hover:border-teal-600 transition-colors cursor-pointer"
                            >
                              <div>
                                <div className="text-lg font-extrabold text-stone-900">
                                  {alt.place.name}
                                </div>
                                <div className="text-sm sm:text-base text-stone-600">
                                  📍 {alt.place.district} · 距上一站{' '}
                                  {alt.distance_from_prev_meters}m（約{' '}
                                  {alt.travel_mins_from_prev} 分鐘）
                                </div>
                              </div>
                              <span className="rounded-xl bg-teal-700 px-3.5 py-2 text-sm sm:text-base font-extrabold text-white shrink-0">
                                換這家 ➔
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* 終點收斂卡片：高鐵／火車站／住宿飯店 */}
              {activePlan.end_anchor && (
                <div className="rounded-2xl border-2 border-rose-500 bg-rose-50/90 p-5 shadow-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-1 text-base font-extrabold text-white">
                      <Train className="h-4 w-4" />
                      🏁 行程終點・順路返回
                    </span>
                    <span className="rounded-xl bg-white border border-rose-300 px-3 py-1 text-base font-extrabold text-rose-900">
                      距離最後一站僅 {activePlan.end_anchor.distance_from_last_stop_meters}m（約 {activePlan.end_anchor.travel_mins_from_last_stop} 分鐘）
                    </span>
                  </div>
                  <div className="text-xl sm:text-2xl font-extrabold text-rose-950">
                    {activePlan.end_anchor.arrival_time} 抵達｜{activePlan.end_anchor.name}
                  </div>
                  {activePlan.end_anchor.return_departure_time && (
                    <div className="text-base sm:text-lg font-bold text-emerald-900 bg-emerald-100/90 border border-emerald-300 rounded-xl px-3.5 py-2">
                      🎫 您的班次為 {activePlan.end_anchor.return_departure_time} 發車，預計提早{' '}
                      <strong>{activePlan.end_anchor.buffer_mins_remaining} 分鐘</strong>{' '}
                      抵達車站還車進月台，完全不趕車！
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
