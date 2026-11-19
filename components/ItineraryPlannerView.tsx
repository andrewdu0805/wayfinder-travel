'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  Clock,
  ExternalLink,
  Loader2,
  Mic,
  MicOff,
  Minus,
  Navigation,
  Plus,
  Repeat,
  RotateCcw,
  Sparkles,
  Train,
  Trash2,
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
  DAY_KIND_LABEL,
  DEFAULT_TRIP_TEXT,
  TRIP_STORAGE_KEY,
  TripAnchor,
  TripDay,
  TripState,
  applyParsedToTrip,
  buildDayBlocks,
  createDefaultTrip,
  defaultHotelForDest,
  getDest,
  hotelsForTrip,
  nightsLabel,
  parseTripFromText,
  stationsForDest,
  tripFromText,
} from '@/lib/trip-planner';
import {
  ItineraryPlan,
  ItineraryStop,
  SavedPlace,
  TravelMode,
  VisitStatus,
} from '@/types/place';
import { RouteVisualizerMap } from './RouteVisualizerMap';

const QUICK_DIALOG_PRESETS = [
  {
    badge: '🧳 3天2夜：高鐵到台南・住台南大飯店（機車）',
    text: DEFAULT_TRIP_TEXT,
  },
  {
    badge: '🏨 2天1夜：火車到台南・住晶英（步行慢遊）',
    text: '明天 10:00 坐火車到台南，住台南晶英酒店一晚，隔天下午 3 點搭火車回去，交通工具是步行',
  },
  {
    badge: '🚄 當天來回：10:30 到台南・16:30 搭高鐵（機車）',
    text: '我 10:30 到台南，16:30 要坐高鐵回程，交通工具是機車，幫我安排順路行程',
  },
  {
    badge: '🚶 單日：台南中西區・步行近距離',
    text: '明天 10:30 要去台南旅遊，大概都是在中西區活動，交通工具是步行，所以安排近一點的地點。',
  },
  {
    badge: '🦆 單日：高雄鹽埕・指定中餐吃鴨肉珍',
    text: '我明天 10:30 要去高雄，幫我安排鹽埕區之旅，不過指定中餐要在鴨肉珍吃，交通工具是步行',
  },
];

const MODE_OPTIONS: Array<{ mode: TravelMode; label: string }> = [
  { mode: 'WALK', label: '🚶 步行' },
  { mode: 'SCOOTER', label: '🛵 機車' },
  { mode: 'DRIVE', label: '🚗 開車' },
];

function shortAnchorName(a: TripAnchor | null | undefined): string {
  if (!a) return '不指定';
  return a.name;
}

export function ItineraryPlannerView() {
  const { places, updatePlaceInline, categoryConfigs, settings } = usePlaces();

  const [trip, setTrip] = useState<TripState>(() => createDefaultTrip());
  const [intentText, setIntentText] = useState(DEFAULT_TRIP_TEXT);
  const [isTripHydrated, setIsTripHydrated] = useState(false);
  const [generatingDay, setGeneratingDay] = useState<number | null>(null);
  const isGenerating = generatingDay !== null;
  const [sessionSkippedIds, setSessionSkippedIds] = useState<string[]>([]);
  const [openSwapStopIndex, setOpenSwapStopIndex] = useState<number | null>(
    null
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showTripSettings, setShowTripSettings] = useState(true);
  const [customHotelInput, setCustomHotelInput] = useState('');
  const [isLookingUpHotel, setIsLookingUpHotel] = useState(false);

  // Voice Recognition (Web Speech API) states
  const [isListening, setIsListening] = useState(false);
  const [voiceStatusMsg, setVoiceStatusMsg] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const latestTranscriptRef = useRef<string>('');

  const dest = getDest(trip.destId);
  const stations = stationsForDest(trip.destId);
  const hotelOptions = hotelsForTrip(trip);
  const activeDay: TripDay | undefined =
    trip.days[trip.activeDayIndex] || trip.days[0];
  const plans = activeDay?.plans || [];
  const activePlanIndex = activeDay?.activePlanIndex || 0;
  const activePlan = plans[activePlanIndex] || null;

  // -------------------------------------------------------------------------
  // Day-level state helpers
  // -------------------------------------------------------------------------
  const patchDay = useCallback(
    (
      dayIdx: number,
      patch: Partial<TripDay> | ((d: TripDay) => Partial<TripDay>)
    ) => {
      setTrip((t) => ({
        ...t,
        days: t.days.map((d) =>
          d.dayIndex === dayIdx
            ? { ...d, ...(typeof patch === 'function' ? patch(d) : patch) }
            : d
        ),
      }));
    },
    []
  );

  const setPlans = (updater: (prev: ItineraryPlan[]) => ItineraryPlan[]) => {
    if (!activeDay) return;
    patchDay(activeDay.dayIndex, (d) => ({ plans: updater(d.plans) }));
  };

  const setActivePlanIndex = (idx: number) => {
    if (!activeDay) return;
    patchDay(activeDay.dayIndex, { activePlanIndex: idx });
  };

  // -------------------------------------------------------------------------
  // Hotel lookup (custom hotel typed by user)
  // -------------------------------------------------------------------------
  const geocodeHotel = useCallback(
    async (hotel: TripAnchor, destId: string): Promise<TripAnchor> => {
      const city = getDest(destId).city;
      try {
        const res = await fetch('/api/smart-parse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: `${hotel.name.replace(/^🏨\s*/, '')} ${city}`,
            defaultCity: city,
            categoryConfigs,
            geminiApiKey: settings.geminiApiKey,
            googleMapsApiKey: settings.googleMapsApiKey,
          }),
        });
        const data = await res.json();
        const p = data.places?.[0];
        if (p && typeof p.latitude === 'number') {
          return {
            ...hotel,
            latitude: p.latitude,
            longitude: p.longitude,
            needsGeocode: false,
          };
        }
      } catch {
        // keep city-center fallback
      }
      return { ...hotel, needsGeocode: false };
    },
    [categoryConfigs, settings.geminiApiKey, settings.googleMapsApiKey]
  );

  // -------------------------------------------------------------------------
  // Per-day itinerary request
  // -------------------------------------------------------------------------
  const fetchDayPlans = useCallback(
    async (
      day: TripDay,
      tripSnap: TripState,
      excludeIds: Set<string>,
      text: string,
      skipped: string[]
    ): Promise<{ plans: ItineraryPlan[]; error: string | null }> => {
      const d = getDest(tripSnap.destId);
      const searchCenterAnchor =
        day.startAnchor.anchor_type === 'hotel'
          ? day.startAnchor
          : day.endAnchor?.anchor_type === 'hotel'
          ? day.endAnchor
          : null;
      const searchCenter = searchCenterAnchor
        ? {
            latitude: searchCenterAnchor.latitude,
            longitude: searchCenterAnchor.longitude,
          }
        : { latitude: d.latitude, longitude: d.longitude };

      // Start point (far-away HSR stations: begin routing from the transfer station in town)
      let origin = {
        name: day.startAnchor.name,
        latitude: day.startAnchor.latitude,
        longitude: day.startAnchor.longitude,
      };
      let startTime = day.startTime;
      if (day.startAnchor.transfer) {
        const tr = day.startAnchor.transfer;
        origin = {
          name: `${tr.viaName}（由${day.startAnchor.name}${tr.note}，約 ${tr.mins} 分）`,
          latitude: tr.viaLat,
          longitude: tr.viaLng,
        };
        startTime = addMinutesToTime(startTime, tr.mins);
      }

      // End point
      let endAnchor: {
        name: string;
        anchor_type: 'hotel' | 'hsr' | 'train';
        latitude: number;
        longitude: number;
      } | null = null;
      let endTime = day.endTime;
      if (day.endAnchor && day.endAnchor.anchor_type !== 'center') {
        const ea = day.endAnchor;
        const type = ea.anchor_type as 'hotel' | 'hsr' | 'train';
        if (ea.transfer) {
          endAnchor = {
            name: `${ea.transfer.viaName}（轉乘往${ea.name}，約 ${ea.transfer.mins} 分）`,
            anchor_type: type,
            latitude: ea.transfer.viaLat,
            longitude: ea.transfer.viaLng,
          };
          if (endTime) endTime = addMinutesToTime(endTime, -ea.transfer.mins);
        } else {
          endAnchor = {
            name: ea.name,
            anchor_type: type,
            latitude: ea.latitude,
            longitude: ea.longitude,
          };
        }
      }
      const isStationEnd = Boolean(endAnchor && endAnchor.anchor_type !== 'hotel');

      try {
        const res = await fetch('/api/chain-itinerary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            strictDay: true,
            places: places.filter(
              (p) => !excludeIds.has(p.id) && !skipped.includes(p.id)
            ),
            origin,
            searchCenter,
            radiusMeters: tripSnap.travelMode === 'WALK' ? 2200 : 9000,
            startTime,
            returnDepartureTime: endTime || undefined,
            endAnchor,
            endBufferMins: isStationEnd ? 25 : 0,
            travelMode: tripSnap.travelMode,
            intentText: text,
            intentBlocks: buildDayBlocks(day.kind, startTime, endTime),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.plans || data.plans.length === 0) {
          return {
            plans: [],
            error:
              data.error ||
              '這天附近找不到符合條件的收藏地點（可能都排在其他天了），可改用機車或到「地點清單」多收藏幾間。',
          };
        }
        return { plans: data.plans, error: null };
      } catch (err) {
        return {
          plans: [],
          error: err instanceof Error ? err.message : '行程運算失敗',
        };
      }
    },
    [places]
  );

  /** Rebuild all days from trip settings and generate them in order (no repeats across days) */
  const generateAllDays = useCallback(
    async (baseTrip: TripState, text: string, skipped: string[]) => {
      setErrorMsg(null);
      setOpenSwapStopIndex(null);
      let t = baseTrip;
      if (t.hotel.needsGeocode) {
        setGeneratingDay(0);
        const h = await geocodeHotel(t.hotel, t.destId);
        t = {
          ...t,
          hotel: h,
          customHotels: t.customHotels.map((c) => (c.id === h.id ? h : c)),
        };
      }
      const { buildTripDays } = await import('@/lib/trip-planner');
      const days = buildTripDays(t);
      t = { ...t, days, activeDayIndex: 0 };
      setTrip(t);

      const used = new Set<string>();
      for (const day of days) {
        setGeneratingDay(day.dayIndex);
        const res = await fetchDayPlans(day, t, used, text, skipped);
        patchDay(day.dayIndex, {
          plans: res.plans,
          activePlanIndex: 0,
          error: res.error,
        });
        res.plans[0]?.stops.forEach((s) => used.add(s.place.id));
      }
      setGeneratingDay(null);
    },
    [fetchDayPlans, geocodeHotel, patchDay]
  );

  /** Re-plan just one day, avoiding places already used on the other days */
  const regenerateDay = useCallback(
    async (dayIdx: number, skipped: string[]) => {
      const day = trip.days.find((d) => d.dayIndex === dayIdx);
      if (!day) return;
      setErrorMsg(null);
      setOpenSwapStopIndex(null);
      const used = new Set<string>();
      for (const d of trip.days) {
        if (d.dayIndex === dayIdx) continue;
        d.plans[d.activePlanIndex]?.stops.forEach((s) => used.add(s.place.id));
      }
      setGeneratingDay(dayIdx);
      const res = await fetchDayPlans(day, trip, used, intentText, skipped);
      patchDay(dayIdx, {
        plans: res.plans,
        activePlanIndex: 0,
        error: res.error,
      });
      setGeneratingDay(null);
    },
    [trip, intentText, fetchDayPlans, patchDay]
  );

  // -------------------------------------------------------------------------
  // Persistence: keep the trip on this device so it's still there during the trip
  // -------------------------------------------------------------------------
  useEffect(() => {
    let loaded = false;
    try {
      const raw = localStorage.getItem(TRIP_STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved?.trip?.days?.length > 0 && saved.trip.hotel) {
          setTrip(saved.trip);
          if (typeof saved.intentText === 'string') setIntentText(saved.intentText);
          if (Array.isArray(saved.sessionSkippedIds)) {
            setSessionSkippedIds(saved.sessionSkippedIds);
          }
          loaded = saved.trip.days.some(
            (d: TripDay) => (d.plans || []).length > 0
          );
        }
      }
    } catch {
      // ignore corrupted storage
    }
    setIsTripHydrated(true);
    if (!loaded && places.length > 0) {
      generateAllDays(createDefaultTrip(), DEFAULT_TRIP_TEXT, []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isTripHydrated) return;
    try {
      localStorage.setItem(
        TRIP_STORAGE_KEY,
        JSON.stringify({ trip, intentText, sessionSkippedIds })
      );
    } catch {
      // storage full / unavailable
    }
  }, [trip, intentText, sessionSkippedIds, isTripHydrated]);

  // -------------------------------------------------------------------------
  // Timeline editing (operates on the active day)
  // -------------------------------------------------------------------------
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
        activePlan.travel_mode,
        activePlan.end_anchor || undefined
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

  // Places already scheduled on other days (so swaps don't create repeats)
  const usedOnOtherDays = new Set<string>();
  for (const d of trip.days) {
    if (!activeDay || d.dayIndex === activeDay.dayIndex) continue;
    d.plans[d.activePlanIndex]?.stops.forEach((s) =>
      usedOnOtherDays.add(s.place.id)
    );
  }

  const handleQuickRejectAndSwap = (stopIndex: number) => {
    if (!activePlan || !activeDay) return;
    const currentStop = activePlan.stops[stopIndex];
    const rejectedId = currentStop.place.id;
    const nextSkipped = [...sessionSkippedIds, rejectedId];
    setSessionSkippedIds(nextSkipped);

    const alt = currentStop.alternatives.find(
      (a) => !usedOnOtherDays.has(a.place.id) && !nextSkipped.includes(a.place.id)
    );
    if (alt) {
      handleSwapStopWithAlternative(stopIndex, alt.place);
    } else {
      regenerateDay(activeDay.dayIndex, nextSkipped);
    }
  };

  const handleRemoveStop = (stopIndex: number) => {
    if (!activePlan || activePlan.stops.length <= 1) return;
    const nextStops = activePlan.stops.filter((_, idx) => idx !== stopIndex);
    recalculateActivePlanStops(nextStops);
  };

  const handleTimelineCheckIn = (stopIndex: number, newStatus: VisitStatus) => {
    if (!activePlan) return;
    const targetStop = activePlan.stops[stopIndex];
    updatePlaceInline(targetStop.place.id, { visit_status: newStatus });

    const nextStops = activePlan.stops.map((st, idx) =>
      idx === stopIndex
        ? { ...st, place: { ...st.place, visit_status: newStatus } }
        : st
    );
    setPlans((prev) =>
      prev.map((pl, idx) =>
        idx === activePlanIndex ? { ...pl, stops: nextStops } : pl
      )
    );
  };

  // -------------------------------------------------------------------------
  // Trip settings
  // -------------------------------------------------------------------------
  const updateTrip = (patch: Partial<TripState>) =>
    setTrip((t) => ({ ...t, ...patch }));

  const handleChangeDest = (destId: string) => {
    setTrip((t) => ({
      ...t,
      destId,
      hotel: defaultHotelForDest(destId),
      customHotels: [],
      arrivalStationId: '',
      departureStationId: '',
    }));
  };

  const handleSelectHotel = (hotelId: string) => {
    const h = hotelOptions.find((x) => x.id === hotelId);
    if (h) updateTrip({ hotel: h });
  };

  const handleAddCustomHotel = async () => {
    const name = customHotelInput.trim();
    if (!name) return;
    setIsLookingUpHotel(true);
    const draft: TripAnchor = {
      id: `custom-${name}`,
      name: `🏨 ${name}`,
      anchor_type: 'hotel',
      latitude: dest.latitude,
      longitude: dest.longitude,
      needsGeocode: true,
    };
    const located = await geocodeHotel(draft, trip.destId);
    setTrip((t) => ({
      ...t,
      hotel: located,
      customHotels: [
        ...t.customHotels.filter((c) => c.id !== located.id),
        located,
      ],
    }));
    setCustomHotelInput('');
    setIsLookingUpHotel(false);
  };

  /** Change where you sleep on a given night; next morning starts from the same hotel */
  const handleChangeDayHotel = (dayIdx: number, hotelId: string) => {
    const h = hotelOptions.find((x) => x.id === hotelId);
    if (!h) return;
    setTrip((t) => ({
      ...t,
      days: t.days.map((d) => {
        if (d.dayIndex === dayIdx) return { ...d, endAnchor: h };
        if (d.dayIndex === dayIdx + 1 && d.startAnchor.anchor_type === 'hotel') {
          return { ...d, startAnchor: h };
        }
        return d;
      }),
    }));
  };

  const handleIntentTextChange = (newText: string) => {
    setIntentText(newText);
    setTrip((t) => applyParsedToTrip(t, parseTripFromText(newText)));
  };

  const applyFullSentence = (text: string) => {
    const fresh = tripFromText(text, trip.destId, trip.travelMode);
    setIntentText(text);
    setSessionSkippedIds([]);
    generateAllDays(fresh, text, []);
  };

  // -------------------------------------------------------------------------
  // Voice input
  // -------------------------------------------------------------------------
  const handleToggleVoiceInput = () => {
    setErrorMsg(null);

    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognitionAPI =
      typeof window !== 'undefined'
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).SpeechRecognition ||
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (window as any).webkitSpeechRecognition
        : null;

    if (!SpeechRecognitionAPI) {
      setErrorMsg(
        '您的瀏覽器不支援直接網頁語音辨識，請點選下方輸入框，再按手機鍵盤上的「🎤 麥克風」語音輸入！'
      );
      document.getElementById('planner-large-dialog')?.focus();
      return;
    }

    try {
      const recognition = new SpeechRecognitionAPI();
      recognition.lang = 'zh-TW';
      recognition.continuous = true;
      recognition.interimResults = true;

      latestTranscriptRef.current = '';
      setIntentText('');
      setVoiceStatusMsg(
        '🎙️ 請開始說話（例如：「明天10點半坐高鐵到台南，住台南大飯店兩晚，第三天下午4點半搭高鐵回去，騎機車」）'
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        let fullText = '';
        for (let i = 0; i < event.results.length; i++) {
          fullText += event.results[i][0].transcript;
        }
        const cleaned = fullText.trim();
        latestTranscriptRef.current = cleaned;
        handleIntentTextChange(cleaned);
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setErrorMsg(
            '請允許瀏覽器的「麥克風權限」，或點選輸入框使用手機鍵盤上的「🎤 麥克風」語音輸入。'
          );
        } else if (event.error !== 'aborted') {
          setVoiceStatusMsg('語音辨識已結束，可點擊按鈕重新說話');
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        const finalSpoken = latestTranscriptRef.current.trim();
        if (finalSpoken) {
          setVoiceStatusMsg('✅ 已聽懂您的行程需求，正在逐日安排...');
          applyFullSentence(finalSpoken);
        } else {
          setVoiceStatusMsg(null);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
    } catch {
      setErrorMsg('無法啟動麥克風，請確認瀏覽器麥克風權限或使用手機鍵盤語音輸入');
      setIsListening(false);
    }
  };

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------
  const isMultiDay = trip.numDays > 1;
  const activeEndIsHotel = activeDay?.endAnchor?.anchor_type === 'hotel';
  const activeEndIsStation =
    activeDay?.endAnchor?.anchor_type === 'hsr' ||
    activeDay?.endAnchor?.anchor_type === 'train';

  return (
    <div className="space-y-5">
      {/* ==================== 對話窗 ＋ 旅程設定 ==================== */}
      <section className="rounded-3xl border-2 border-amber-400/80 bg-white p-4 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-xs shrink-0">
              <Sparkles className="h-6 w-6" />
            </span>
            <div>
              <h2 className="text-lg sm:text-2xl font-extrabold text-stone-900 leading-snug">
                🗣️ 直接用說的排行程
              </h2>
              <p className="text-xs sm:text-sm font-bold text-stone-500">
                支援多天行程：幾天幾夜、住哪間飯店、高鐵／火車時間，說一次就逐日排好
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              id="btn-voice-dictation"
              type="button"
              onClick={handleToggleVoiceInput}
              className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-base sm:text-lg font-extrabold shadow-xs transition-all cursor-pointer bg-rose-600 text-white hover:bg-rose-700 ${
                isListening ? 'animate-pulse ring-4 ring-rose-200' : ''
              }`}
            >
              {isListening ? (
                <>
                  <MicOff className="h-5 w-5 shrink-0" />
                  <span>🔴 正在聽... (點此完成)</span>
                </>
              ) : (
                <>
                  <Mic className="h-5 w-5 shrink-0" />
                  <span>🎤 點此開口說行程</span>
                </>
              )}
            </button>

            {intentText && (
              <button
                type="button"
                onClick={() => {
                  setIntentText('');
                  setVoiceStatusMsg(null);
                  document.getElementById('planner-large-dialog')?.focus();
                }}
                title="清空輸入框"
                className="inline-flex items-center gap-1 rounded-2xl border-2 border-stone-300 bg-stone-50 px-3 py-2.5 text-sm sm:text-base font-extrabold text-stone-600 hover:bg-stone-100 cursor-pointer shrink-0"
              >
                <Trash2 className="h-4 w-4" />
                <span>清空</span>
              </button>
            )}
          </div>
        </div>

        {voiceStatusMsg && (
          <div
            className={`rounded-2xl px-4 py-2.5 text-sm sm:text-base font-extrabold flex items-center justify-between gap-2 ${
              isListening
                ? 'bg-rose-50 border-2 border-rose-300 text-rose-900'
                : 'bg-emerald-50 border border-emerald-300 text-emerald-900'
            }`}
          >
            <span>{voiceStatusMsg}</span>
            {isListening && (
              <button
                type="button"
                onClick={handleToggleVoiceInput}
                className="rounded-xl bg-rose-600 px-3 py-1 text-xs sm:text-sm font-extrabold text-white shrink-0"
              >
                說完了・開始排程
              </button>
            )}
          </div>
        )}

        <textarea
          id="planner-large-dialog"
          rows={3}
          value={intentText}
          onChange={(e) => handleIntentTextChange(e.target.value)}
          placeholder="點擊上方「🎤 點此開口說行程」，或直接打字：&#10;「明天 10:30 坐高鐵到台南，住台南大飯店兩晚，第三天下午 4 點半搭高鐵回去，騎機車」"
          className={`w-full rounded-2xl border-2 p-4 text-lg sm:text-xl font-bold text-stone-900 placeholder:text-stone-400 focus:outline-none leading-relaxed transition-colors ${
            isListening
              ? 'border-rose-500 bg-rose-50/40'
              : 'border-stone-300 bg-stone-50/70 focus:border-amber-600 focus:bg-white'
          }`}
        />

        {/* ---------- 旅程設定（文字／語音會自動同步到這裡，也可手動調整） ---------- */}
        <div className="rounded-2xl bg-stone-100/90 border border-stone-200 p-3 sm:p-4 space-y-3">
          <button
            type="button"
            onClick={() => setShowTripSettings((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-left cursor-pointer"
          >
            <span className="inline-flex items-center gap-1.5 text-base sm:text-lg font-extrabold text-stone-900">
              <CalendarDays className="h-5 w-5 text-amber-700" />
              {dest.shortLabel}・{nightsLabel(trip.numDays)}
              {isMultiDay && (
                <span className="text-sm font-bold text-stone-500 truncate">
                  ｜{shortAnchorName(trip.hotel)}
                </span>
              )}
            </span>
            <span className="text-sm font-bold text-amber-700 shrink-0">
              {showTripSettings ? '收合 ▲' : '調整 ▼'}
            </span>
          </button>

          {showTripSettings && (
            <div className="space-y-3">
              {/* 城市 ＋ 天數 */}
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-xs sm:text-sm font-extrabold text-stone-600">📍 目的地</span>
                  <select
                    value={trip.destId}
                    onChange={(e) => handleChangeDest(e.target.value)}
                    className="w-full rounded-xl border-2 border-stone-300 bg-white px-2.5 py-2 text-sm sm:text-base font-extrabold text-stone-900"
                  >
                    {PRESET_DESTINATIONS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.shortLabel}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="space-y-1">
                  <span className="text-xs sm:text-sm font-extrabold text-stone-600">📅 天數</span>
                  <div className="flex items-center justify-between rounded-xl border-2 border-stone-300 bg-white px-1 py-1">
                    <button
                      type="button"
                      aria-label="減少天數"
                      onClick={() => updateTrip({ numDays: Math.max(1, trip.numDays - 1) })}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-stone-100 text-stone-700 cursor-pointer"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="text-sm sm:text-base font-extrabold text-stone-900 whitespace-nowrap">
                      {nightsLabel(trip.numDays)}
                    </span>
                    <button
                      type="button"
                      aria-label="增加天數"
                      onClick={() => updateTrip({ numDays: Math.min(7, trip.numDays + 1) })}
                      className="h-8 w-8 inline-flex items-center justify-center rounded-lg bg-stone-100 text-stone-700 cursor-pointer"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* 住宿 */}
              {(isMultiDay || trip.singleDayEnd === 'hotel') && (
                <div className="space-y-1">
                  <span className="text-xs sm:text-sm font-extrabold text-stone-600">🏨 住宿飯店</span>
                  <select
                    value={trip.hotel.id}
                    onChange={(e) => handleSelectHotel(e.target.value)}
                    className="w-full rounded-xl border-2 border-stone-300 bg-white px-2.5 py-2 text-sm sm:text-base font-extrabold text-stone-900"
                  >
                    {hotelOptions.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                        {h.needsGeocode ? '（排程時查詢位置）' : ''}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={customHotelInput}
                      onChange={(e) => setCustomHotelInput(e.target.value)}
                      placeholder="其他飯店：輸入名稱（例：煙波大飯店台南館）"
                      className="flex-1 min-w-0 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-sm font-bold text-stone-900"
                    />
                    <button
                      type="button"
                      disabled={!customHotelInput.trim() || isLookingUpHotel}
                      onClick={handleAddCustomHotel}
                      className="rounded-xl bg-stone-800 px-3 py-1.5 text-sm font-extrabold text-white disabled:opacity-40 cursor-pointer shrink-0"
                    >
                      {isLookingUpHotel ? '查詢中...' : '設為住宿'}
                    </button>
                  </div>
                </div>
              )}

              {/* 抵達 */}
              <div className="grid grid-cols-12 gap-2 items-end">
                <label className="col-span-7 space-y-1">
                  <span className="text-xs sm:text-sm font-extrabold text-stone-600">
                    🛬 {isMultiDay ? '第 1 天抵達' : '抵達／出發'}
                  </span>
                  <select
                    value={trip.arrivalStationId}
                    onChange={(e) => updateTrip({ arrivalStationId: e.target.value })}
                    className="w-full rounded-xl border-2 border-stone-300 bg-white px-2 py-2 text-sm font-extrabold text-stone-900"
                  >
                    <option value="">不指定（從市區出發）</option>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="col-span-5 space-y-1">
                  <span className="text-xs sm:text-sm font-extrabold text-stone-600">時間</span>
                  <input
                    type="time"
                    value={trip.arrivalTime}
                    onChange={(e) => updateTrip({ arrivalTime: e.target.value })}
                    className="w-full rounded-xl border-2 border-stone-300 bg-white px-2 py-1.5 text-base font-extrabold text-stone-900"
                  />
                </label>
              </div>

              {/* 單日：今天結束在 */}
              {!isMultiDay && (
                <div className="space-y-1">
                  <span className="text-xs sm:text-sm font-extrabold text-stone-600">🏁 今天結束在</span>
                  <div className="grid grid-cols-3 gap-1 rounded-xl border border-stone-300 bg-white p-1">
                    {(
                      [
                        { key: 'none', label: '不指定' },
                        { key: 'hotel', label: '🏨 回飯店' },
                        { key: 'station', label: '🚄 搭車回程' },
                      ] as const
                    ).map((o) => (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() =>
                          updateTrip({
                            singleDayEnd: o.key,
                            departureStationId:
                              o.key === 'station' && !trip.departureStationId
                                ? stations[0]?.id || ''
                                : trip.departureStationId,
                          })
                        }
                        className={`rounded-lg py-1.5 text-sm font-extrabold cursor-pointer ${
                          trip.singleDayEnd === o.key
                            ? 'bg-stone-900 text-white'
                            : 'text-stone-600'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 回程 */}
              {(isMultiDay || trip.singleDayEnd === 'station') && (
                <div className="grid grid-cols-12 gap-2 items-end">
                  <label className="col-span-7 space-y-1">
                    <span className="text-xs sm:text-sm font-extrabold text-stone-600">
                      🚄 {isMultiDay ? `第 ${trip.numDays} 天回程` : '回程搭車'}
                    </span>
                    <select
                      value={trip.departureStationId}
                      onChange={(e) => updateTrip({ departureStationId: e.target.value })}
                      className="w-full rounded-xl border-2 border-rose-300 bg-white px-2 py-2 text-sm font-extrabold text-rose-900"
                    >
                      <option value="">不指定（不用趕車）</option>
                      {stations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="col-span-5 space-y-1">
                    <span className="text-xs sm:text-sm font-extrabold text-stone-600">發車</span>
                    <input
                      type="time"
                      value={trip.departureTime}
                      disabled={!trip.departureStationId}
                      onChange={(e) => updateTrip({ departureTime: e.target.value })}
                      className="w-full rounded-xl border-2 border-rose-300 bg-white px-2 py-1.5 text-base font-extrabold text-rose-900 disabled:opacity-40"
                    />
                  </label>
                </div>
              )}

              {/* 每天出門／回飯店 */}
              {(isMultiDay || trip.singleDayEnd === 'hotel') && (
                <div className="grid grid-cols-2 gap-2">
                  {isMultiDay && (
                    <label className="space-y-1">
                      <span className="text-xs sm:text-sm font-extrabold text-stone-600">☀️ 每天幾點出門</span>
                      <input
                        type="time"
                        value={trip.dailyStart}
                        onChange={(e) => updateTrip({ dailyStart: e.target.value })}
                        className="w-full rounded-xl border-2 border-stone-300 bg-white px-2 py-1.5 text-base font-extrabold text-stone-900"
                      />
                    </label>
                  )}
                  <label className="space-y-1">
                    <span className="text-xs sm:text-sm font-extrabold text-stone-600">🌙 幾點回飯店</span>
                    <input
                      type="time"
                      value={trip.dailyEnd}
                      onChange={(e) => updateTrip({ dailyEnd: e.target.value })}
                      className="w-full rounded-xl border-2 border-stone-300 bg-white px-2 py-1.5 text-base font-extrabold text-stone-900"
                    />
                  </label>
                </div>
              )}

              {/* 交通工具 */}
              <div className="grid grid-cols-3 gap-1 rounded-xl border border-stone-300 bg-white p-1">
                {MODE_OPTIONS.map((m) => (
                  <button
                    key={m.mode}
                    type="button"
                    onClick={() => updateTrip({ travelMode: m.mode })}
                    className={`rounded-lg py-1.5 text-sm sm:text-base font-extrabold transition-all cursor-pointer ${
                      trip.travelMode === m.mode
                        ? 'bg-stone-900 text-white'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            id="btn-generate-itinerary"
            type="button"
            disabled={isGenerating}
            onClick={() => {
              setSessionSkippedIds([]);
              generateAllDays(trip, intentText, []);
            }}
            className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-600 px-6 py-3 text-lg font-extrabold text-white shadow-sm hover:bg-amber-700 disabled:opacity-50 transition-all cursor-pointer"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                正在安排第 {(generatingDay ?? 0) + 1} 天...
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                ✨ {isMultiDay ? `排出 ${trip.numDays} 天行程` : '立即安排順路行程'}
              </>
            )}
          </button>
        </div>

        {/* 範例 */}
        <div className="space-y-2">
          <div className="text-sm sm:text-base font-extrabold text-stone-500">
            💡 點擊範例直接測試：
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_DIALOG_PRESETS.map((preset, i) => (
              <button
                key={i}
                type="button"
                disabled={isGenerating}
                onClick={() => applyFullSentence(preset.text)}
                className={`rounded-xl border px-3 py-1.5 text-sm font-bold transition-all cursor-pointer text-left disabled:opacity-50 ${
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

      {/* ==================== 每日頁籤 ==================== */}
      {trip.days.length > 1 && (
        <div className="sticky top-[132px] sm:top-36 z-20 -mx-1 px-1 py-1 bg-[#f7f5f0]/95 backdrop-blur-sm">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {trip.days.map((d) => {
              const isActive = activeDay?.dayIndex === d.dayIndex;
              const stopsCount = d.plans[d.activePlanIndex]?.stops.length || 0;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    updateTrip({ activeDayIndex: d.dayIndex });
                    setOpenSwapStopIndex(null);
                  }}
                  className={`shrink-0 rounded-2xl border-2 px-3.5 py-2 text-left transition-all cursor-pointer ${
                    isActive
                      ? 'border-amber-600 bg-amber-600 text-white shadow-sm'
                      : 'border-stone-200 bg-white text-stone-800 hover:border-amber-400'
                  }`}
                >
                  <div className="text-base font-extrabold whitespace-nowrap">
                    第 {d.dayIndex + 1} 天・{DAY_KIND_LABEL[d.kind]}
                  </div>
                  <div
                    className={`text-xs font-bold whitespace-nowrap ${
                      isActive ? 'text-amber-50' : 'text-stone-500'
                    }`}
                  >
                    {generatingDay === d.dayIndex ? (
                      <span className="inline-flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" /> 排程中
                      </span>
                    ) : d.error ? (
                      '⚠️ 未排出'
                    ) : (
                      `${d.startTime} 起・${stopsCount} 站`
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================== 當日起訖設定 ==================== */}
      {activeDay && (
        <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-base sm:text-lg font-extrabold text-stone-900">
              {trip.days.length > 1
                ? `第 ${activeDay.dayIndex + 1} 天・${DAY_KIND_LABEL[activeDay.kind]}`
                : '今日行程'}
            </div>
            <button
              type="button"
              disabled={isGenerating}
              onClick={() => regenerateDay(activeDay.dayIndex, sessionSkippedIds)}
              className="inline-flex items-center gap-1.5 rounded-xl border-2 border-amber-600 bg-amber-50 px-3 py-1.5 text-sm font-extrabold text-amber-900 hover:bg-amber-100 disabled:opacity-50 cursor-pointer"
            >
              {generatingDay === activeDay.dayIndex ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              重排這天
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 space-y-1.5">
              <div className="text-xs font-extrabold text-emerald-800">🚩 出發</div>
              <div className="text-sm sm:text-base font-extrabold text-stone-900">
                {activeDay.startAnchor.name}
              </div>
              <input
                type="time"
                value={activeDay.startTime}
                onChange={(e) => patchDay(activeDay.dayIndex, { startTime: e.target.value })}
                className="rounded-lg border border-emerald-300 bg-white px-2 py-1 text-base font-extrabold text-stone-900"
              />
              {activeDay.startAnchor.transfer && (
                <div className="text-xs font-bold text-emerald-900">
                  🔁 {activeDay.startAnchor.transfer.note}（約 {activeDay.startAnchor.transfer.mins} 分），
                  {addMinutesToTime(activeDay.startTime, activeDay.startAnchor.transfer.mins)} 起從
                  {activeDay.startAnchor.transfer.viaName} 開始玩
                </div>
              )}
            </div>

            <div className="rounded-xl bg-rose-50 border border-rose-200 p-2.5 space-y-1.5">
              <div className="text-xs font-extrabold text-rose-800">
                🏁 {activeEndIsHotel ? '今晚回飯店' : activeEndIsStation ? '搭車回程' : '結束（不指定終點）'}
              </div>
              {activeEndIsHotel && activeDay.kind !== 'single' ? (
                <select
                  value={activeDay.endAnchor?.id}
                  onChange={(e) => handleChangeDayHotel(activeDay.dayIndex, e.target.value)}
                  className="w-full rounded-lg border border-rose-300 bg-white px-2 py-1 text-sm font-extrabold text-stone-900"
                >
                  {hotelOptions.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm sm:text-base font-extrabold text-stone-900">
                  {activeDay.endAnchor?.name || '玩到哪算到哪'}
                </div>
              )}
              {activeDay.endAnchor && (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={activeDay.endTime}
                    onChange={(e) => patchDay(activeDay.dayIndex, { endTime: e.target.value })}
                    className="rounded-lg border border-rose-300 bg-white px-2 py-1 text-base font-extrabold text-stone-900"
                  />
                  <span className="text-xs font-bold text-rose-800">
                    {activeEndIsHotel ? '前回到飯店' : '發車'}
                  </span>
                </div>
              )}
              {activeDay.endAnchor?.transfer && activeDay.endTime && (
                <div className="text-xs font-bold text-rose-900">
                  🔁 需預留 {activeDay.endAnchor.transfer.mins} 分轉乘，
                  {addMinutesToTime(activeDay.endTime, -activeDay.endAnchor.transfer.mins)} 前到
                  {activeDay.endAnchor.transfer.viaName}
                </div>
              )}
            </div>
          </div>
          <p className="text-xs font-bold text-stone-500">
            修改時間或飯店後按「重排這天」；其他天已排的店不會重複出現。
          </p>
        </section>
      )}

      {activeDay?.error && generatingDay !== activeDay.dayIndex && (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 p-4 text-base font-bold text-amber-900">
          ⚠️ {activeDay.error}
        </div>
      )}

      {sessionSkippedIds.length > 0 && activeDay && (
        <button
          type="button"
          onClick={() => {
            setSessionSkippedIds([]);
            regenerateDay(activeDay.dayIndex, []);
          }}
          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-100 px-3 py-2 text-sm font-bold text-stone-700 hover:bg-stone-200 cursor-pointer"
        >
          <RotateCcw className="h-4 w-4" />
          復原換掉的店 ({sessionSkippedIds.length})
        </button>
      )}

      {/* ==================== 排程結果：互動地圖 ＋ 大字時間軸 ==================== */}
      {activePlan && (
        <section className="space-y-5">
          <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 shadow-xs space-y-4">
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
                    className={`rounded-xl px-3.5 py-2 text-sm sm:text-base font-extrabold transition-all cursor-pointer text-left ${
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
                className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-base font-extrabold text-white shadow-xs hover:bg-teal-800 transition-colors"
              >
                <Navigation className="h-5 w-5" />
                {trip.days.length > 1 ? `第 ${(activeDay?.dayIndex ?? 0) + 1} 天 Google Maps 導航` : '開啟 Google Maps 全程導航'}
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>

            {activePlan.time_fit_note && (
              <div className="rounded-xl border-2 border-teal-300 bg-teal-50/80 px-4 py-3 text-base font-extrabold text-teal-950 flex flex-wrap items-center justify-between gap-2">
                <span>{activePlan.time_fit_note}</span>
                {activePlan.must_arrive_by && (
                  <span className="rounded-lg bg-rose-100 border border-rose-300 px-3 py-1 text-sm font-extrabold text-rose-900">
                    🎯 最晚進站：{activePlan.must_arrive_by}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 lg:sticky lg:top-36">
              <RouteVisualizerMap
                origin={activePlan.origin}
                candidates={places.filter((p) => p.city === dest.city)}
                activePlan={activePlan}
              />
            </div>

            <div className="lg:col-span-7 space-y-4">
              {activePlan.stops.map((stop, idx) => (
                <div
                  key={`${stop.place.id}-${idx}`}
                  className="rounded-2xl border-2 border-stone-200 bg-white p-4 sm:p-5 shadow-xs space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-xl bg-amber-600 px-3 py-1 text-base font-extrabold text-white">
                        第 {stop.stop_order} 站・{stop.place.district}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-xl bg-stone-100 px-3 py-1 text-base font-extrabold text-stone-900">
                        <Clock className="h-4 w-4 text-amber-700" />
                        {stop.arrival_time} – {stop.departure_time}
                      </span>
                    </div>
                    <span className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-1 text-sm font-extrabold text-emerald-800">
                      {stop.distance_meters_from_prev}m（移動 {stop.travel_mins_from_prev} 分・停留 {stop.stay_mins} 分）
                    </span>
                  </div>

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

                  <div className="rounded-xl bg-amber-50/70 border border-amber-200/80 px-4 py-2.5 text-base font-bold text-stone-800">
                    {stop.ai_reason}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-stone-100">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleQuickRejectAndSwap(idx)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-base font-extrabold text-white hover:bg-amber-700 transition-colors cursor-pointer"
                      >
                        🔀 秒換下一間
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setOpenSwapStopIndex(openSwapStopIndex === idx ? null : idx)
                        }
                        className="inline-flex items-center gap-1.5 rounded-xl border-2 border-teal-600 bg-teal-50 px-3.5 py-1.5 text-base font-extrabold text-teal-900 hover:bg-teal-100 transition-colors cursor-pointer"
                      >
                        <Repeat className="h-4 w-4" />
                        自選 ({stop.alternatives.filter((a) => !usedOnOtherDays.has(a.place.id)).length})
                      </button>

                      {activePlan.stops.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveStop(idx)}
                          className="inline-flex items-center gap-1 rounded-xl border border-stone-300 bg-stone-50 px-3 py-1.5 text-base font-bold text-stone-600 hover:bg-stone-100 cursor-pointer"
                        >
                          <X className="h-4 w-4" />
                          略過
                        </button>
                      )}
                    </div>

                    <div className="inline-flex rounded-xl bg-stone-100 p-1 gap-1">
                      <button
                        type="button"
                        onClick={() => handleTimelineCheckIn(idx, 'visited_revisit')}
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
                        onClick={() => handleTimelineCheckIn(idx, 'visited_skip')}
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

                  {openSwapStopIndex === idx && (
                    <div className="rounded-xl border-2 border-teal-300 bg-teal-50/50 p-4 space-y-2.5">
                      <div className="text-base font-extrabold text-teal-950">
                        點選下方同類型店家即可立即替換：
                      </div>
                      {stop.alternatives.filter((a) => !usedOnOtherDays.has(a.place.id)).length === 0 ? (
                        <div className="text-base text-stone-500">
                          附近無其他同分類備選店家（或已排在其他天）
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {stop.alternatives
                            .filter((a) => !usedOnOtherDays.has(a.place.id))
                            .map((alt) => (
                              <button
                                key={alt.place.id}
                                type="button"
                                onClick={() => handleSwapStopWithAlternative(idx, alt.place)}
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

              {/* 終點卡片：回飯店 or 搭車 */}
              {activePlan.end_anchor && (
                <div
                  className={`rounded-2xl border-2 p-4 sm:p-5 shadow-xs space-y-2 ${
                    activePlan.end_anchor.anchor_type === 'hotel'
                      ? 'border-indigo-400 bg-indigo-50/90'
                      : 'border-rose-500 bg-rose-50/90'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1 text-base font-extrabold text-white ${
                        activePlan.end_anchor.anchor_type === 'hotel' ? 'bg-indigo-600' : 'bg-rose-600'
                      }`}
                    >
                      {activePlan.end_anchor.anchor_type === 'hotel' ? (
                        '🌙 今日終點・回飯店休息'
                      ) : (
                        <>
                          <Train className="h-4 w-4" />
                          🏁 搭車回程
                        </>
                      )}
                    </span>
                    <span className="rounded-xl bg-white border border-stone-300 px-3 py-1 text-sm font-extrabold text-stone-800">
                      距最後一站 {activePlan.end_anchor.distance_from_last_stop_meters}m（約 {activePlan.end_anchor.travel_mins_from_last_stop} 分鐘）
                    </span>
                  </div>
                  <div className="text-xl sm:text-2xl font-extrabold text-stone-950">
                    {activePlan.end_anchor.arrival_time} 抵達｜{activePlan.end_anchor.name}
                  </div>
                  {activePlan.end_anchor.anchor_type !== 'hotel' &&
                    activePlan.end_anchor.return_departure_time && (
                      <div className="text-base font-bold text-emerald-900 bg-emerald-100/90 border border-emerald-300 rounded-xl px-3.5 py-2">
                        🎫 班次 {activePlan.end_anchor.return_departure_time} 發車，預計提早{' '}
                        <strong>{activePlan.end_anchor.buffer_mins_remaining} 分鐘</strong> 抵達，不用趕車！
                      </div>
                    )}
                  {activePlan.end_anchor.anchor_type === 'hotel' &&
                    activeDay &&
                    activeDay.dayIndex + 1 < trip.days.length && (
                      <button
                        type="button"
                        onClick={() => updateTrip({ activeDayIndex: activeDay.dayIndex + 1 })}
                        className="text-base font-extrabold text-indigo-800 underline cursor-pointer"
                      >
                        看第 {activeDay.dayIndex + 2} 天行程 ➔
                      </button>
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
