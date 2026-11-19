import { NextRequest, NextResponse } from 'next/server';
import {
  addMinutesToTime,
  buildGoogleMapsDirUrl,
  calculateDistanceMeters,
  checkPlaceOpenAtTime,
  estimateTravelMins,
} from '@/lib/geo-utils';
import { PRESET_DESTINATIONS } from '@/lib/default-data';
import {
  IntentStepBlock,
  ItineraryPlan,
  ItineraryStop,
  SavedPlace,
  TravelMode,
} from '@/types/place';

function normalizeShortName(name: string): string {
  return name
    .replace(/\([^)]*\)|（[^）]*）|【[^】]*】/g, '')
    .replace(/\s+/g, '')
    .trim();
}

/**
 * Parse natural language prompt for:
 * 1. Pinned / Must-visit places (e.g. "指定中餐要在鴨肉珍吃")
 * 2. Explicitly excluded places in prompt (e.g. "不想去駁二", "不要去婆婆冰")
 */
function parsePromptConstraints(
  promptText: string,
  allPlaces: SavedPlace[]
): {
  pinnedBySubCat: Map<string, SavedPlace>;
  excludedIdsInPrompt: Set<string>;
} {
  const pinnedBySubCat = new Map<string, SavedPlace>();
  const excludedIdsInPrompt = new Set<string>();
  const cleanPrompt = (promptText || '').trim();
  if (!cleanPrompt) return { pinnedBySubCat, excludedIdsInPrompt };

  for (const p of allPlaces) {
    const shortName = normalizeShortName(p.name);
    if (shortName.length < 2) continue;
    const idx = cleanPrompt.indexOf(shortName);
    if (idx === -1) continue;

    const prefixSlice = cleanPrompt.slice(Math.max(0, idx - 8), idx);
    if (/不想去|不要去|排除|跳過|不去|換掉/.test(prefixSlice)) {
      excludedIdsInPrompt.add(p.id);
    } else {
      pinnedBySubCat.set(p.sub_category, p);
    }
  }
  return { pinnedBySubCat, excludedIdsInPrompt };
}

function parseIntentSequenceFromText(
  promptText: string,
  blocks: IntentStepBlock[],
  pinnedBySubCat: Map<string, SavedPlace>
): IntentStepBlock[] {
  const text = (promptText || '').trim();

  if (/之旅|一日遊|半日遊|安排|行程/.test(text)) {
    const pinnedMeal = pinnedBySubCat.get('meal');
    const pinnedMuseum = pinnedBySubCat.get('museum');
    const pinnedSnack = pinnedBySubCat.get('snack_dessert');
    const pinnedSouvenir = pinnedBySubCat.get('souvenir');

    return [
      {
        id: 'nlp-trip-1',
        label: pinnedMuseum
          ? `📌 指定展館：${normalizeShortName(pinnedMuseum.name)}`
          : '沒去過的展館／博物館',
        primary_category: 'museum_culture',
        sub_category: 'museum',
        only_unvisited: !pinnedMuseum,
      },
      {
        id: 'nlp-trip-2',
        label: pinnedMeal
          ? `📌 指定中餐：${normalizeShortName(pinnedMeal.name)}`
          : '餐廳：正餐',
        primary_category: 'restaurant',
        sub_category: 'meal',
        only_unvisited: false,
      },
      {
        id: 'nlp-trip-3',
        label: pinnedSnack
          ? `📌 指定點心：${normalizeShortName(pinnedSnack.name)}`
          : '餐廳：點心／下午茶',
        primary_category: 'restaurant',
        sub_category: 'snack_dessert',
        only_unvisited: false,
      },
      {
        id: 'nlp-trip-4',
        label: pinnedSouvenir
          ? `📌 指定伴手禮：${normalizeShortName(pinnedSouvenir.name)}`
          : '餐廳：伴手禮',
        primary_category: 'restaurant',
        sub_category: 'souvenir',
        only_unvisited: false,
      },
    ];
  }

  return blocks.length > 0
    ? blocks
    : [
        {
          id: 'default-1',
          label: '沒去過的展館／博物館',
          primary_category: 'museum_culture',
          sub_category: 'museum',
          only_unvisited: true,
        },
        {
          id: 'default-2',
          label: '餐廳：正餐',
          primary_category: 'restaurant',
          sub_category: 'meal',
          only_unvisited: false,
        },
        {
          id: 'default-3',
          label: '餐廳：點心／下午茶',
          primary_category: 'restaurant',
          sub_category: 'snack_dessert',
          only_unvisited: false,
        },
        {
          id: 'default-4',
          label: '餐廳：伴手禮',
          primary_category: 'restaurant',
          sub_category: 'souvenir',
          only_unvisited: false,
        },
      ];
}

const KNOWN_END_ANCHORS: Array<{
  keywords: RegExp;
  name: string;
  anchor_type: 'hotel' | 'hsr' | 'train';
  city: string;
  latitude: number;
  longitude: number;
}> = [
  {
    keywords: /高鐵|高鐵站|坐高鐵|搭高鐵/,
    name: '🚄 高鐵台南站聯絡道 (東區裕信／台86線往高鐵門戶)',
    anchor_type: 'hsr',
    city: '台南市',
    latitude: 22.9765,
    longitude: 120.2235,
  },
  {
    keywords: /高鐵|左營高鐵|新左營/,
    name: '🚄 高鐵左營站',
    anchor_type: 'hsr',
    city: '高雄市',
    latitude: 22.6874,
    longitude: 120.3075,
  },
  {
    keywords: /火車|台鐵|臺鐵|台南火車站|臺南火車站|坐火車|搭火車/,
    name: '🚆 台鐵台南火車站 (前站還車／搭火車回程)',
    anchor_type: 'train',
    city: '台南市',
    latitude: 22.9972,
    longitude: 120.2116,
  },
  {
    keywords: /火車|台鐵|高雄火車站|高雄車站|坐火車|搭火車/,
    name: '🚆 台鐵高雄火車站',
    anchor_type: 'train',
    city: '高雄市',
    latitude: 22.6396,
    longitude: 120.3026,
  },
  {
    keywords: /台南大飯店|臺南大飯店/,
    name: '🏨 台南大飯店 (台南火車站前)',
    anchor_type: 'hotel',
    city: '台南市',
    latitude: 22.9972,
    longitude: 120.2116,
  },
  {
    keywords: /晶英酒店|台南晶英/,
    name: '🏨 台南晶英酒店 (中西區和意路)',
    anchor_type: 'hotel',
    city: '台南市',
    latitude: 22.9878,
    longitude: 120.1992,
  },
  {
    keywords: /翰品酒店|城市商旅|鹽埕飯店/,
    name: '🏨 高雄鹽埕翰品酒店',
    anchor_type: 'hotel',
    city: '高雄市',
    latitude: 22.6248,
    longitude: 120.2862,
  },
];

function extractHotelEndAnchor(
  promptText: string,
  city: string
): { name: string; anchor_type?: 'hotel' | 'hsr' | 'train'; latitude: number; longitude: number } | null {
  const clean = (promptText || '').trim();
  if (!clean) return null;

  for (const h of KNOWN_END_ANCHORS) {
    if (h.city === city && h.keywords.test(clean)) {
      return {
        name: h.name,
        anchor_type: h.anchor_type,
        latitude: h.latitude,
        longitude: h.longitude,
      };
    }
  }

  // Generic pattern: "住在XXX" or "下榻XXX" or "回XXX飯店"
  const match = clean.match(/(?:住在|下榻|住|回到|最後回)([^\s，,。！!？?]{2,12}?(?:飯店|酒店|民宿|商旅|旅店|車站|高鐵))/);
  if (match) {
    const hotelName = `🏨 ${match[1]}`;
    if (city === '台南市') {
      return { name: hotelName, anchor_type: 'hotel', latitude: 22.9972, longitude: 120.2116 };
    }
    if (city === '高雄市') {
      return { name: hotelName, anchor_type: 'hotel', latitude: 22.6248, longitude: 120.2862 };
    }
    return { name: hotelName, anchor_type: 'hotel', latitude: 25.0525, longitude: 121.5150 };
  }
  return null;
}

function timeStrToMins(t: string): number {
  const [h, m] = (t || '10:00').split(':').map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

function extractTimesFromPrompt(promptText: string): {
  parsedArrivalTime: string | null;
  parsedDepartureTime: string | null;
} {
  const clean = (promptText || '').trim();
  if (!clean) return { parsedArrivalTime: null, parsedDepartureTime: null };

  const allTimes = Array.from(clean.matchAll(/(\d{1,2})[:：點](\d{2})?/g)).map(
    (m) => {
      const hh = String(parseInt(m[1], 10)).padStart(2, '0');
      const mm = m[2] ? String(parseInt(m[2], 10)).padStart(2, '0') : '00';
      return `${hh}:${mm}`;
    }
  );

  if (allTimes.length >= 2) {
    return {
      parsedArrivalTime: allTimes[0],
      parsedDepartureTime: allTimes[1],
    };
  }
  if (allTimes.length === 1) {
    if (/回程|搭車|坐高鐵|搭高鐵|坐火車|搭火車|離開|發車/.test(clean)) {
      return { parsedArrivalTime: null, parsedDepartureTime: allTimes[0] };
    }
    return { parsedArrivalTime: allTimes[0], parsedDepartureTime: null };
  }
  return { parsedArrivalTime: null, parsedDepartureTime: null };
}

function buildPlanFromSelectedStops(params: {
  planId: string;
  title: string;
  subtitle: string;
  origin: { name: string; latitude: number; longitude: number };
  endAnchor?: { name: string; anchor_type?: 'hotel' | 'hsr' | 'train'; latitude: number; longitude: number } | null;
  startTime: string;
  returnDepartureTime?: string | null;
  travelMode: TravelMode;
  selectedPlaces: Array<{
    place: SavedPlace;
    stepBlock: IntentStepBlock;
    isPinned: boolean;
  }>;
  allNearbyCandidates: SavedPlace[];
  refreshedCount: number;
  excludedClosedPlaces: Array<{ name: string; reason: string }>;
  endBufferMins?: number;
}): ItineraryPlan {
  const {
    planId,
    title,
    subtitle,
    origin,
    endAnchor,
    startTime,
    returnDepartureTime,
    travelMode,
    selectedPlaces,
    allNearbyCandidates,
    refreshedCount,
    excludedClosedPlaces,
  } = params;

  const isStationEnd =
    endAnchor?.anchor_type === 'hsr' || endAnchor?.anchor_type === 'train';
  const STATION_BUFFER_MINS =
    typeof params.endBufferMins === 'number'
      ? params.endBufferMins
      : isStationEnd || !endAnchor
      ? 25
      : 0;
  const deadlineWord = isStationEnd || !endAnchor ? '發車' : '回到飯店';
  let activeSelection = [...selectedPlaces];
  let stayScaleFactor = 1.0;
  let timeFitNote: string | null = null;

  // Pre-calculate travel and stay budget if returnDepartureTime is provided
  if (returnDepartureTime && activeSelection.length > 0) {
    const startM = timeStrToMins(startTime);
    const depM = timeStrToMins(returnDepartureTime);
    const deadlineM = depM - STATION_BUFFER_MINS;
    const netBudgetMins = deadlineM - startM;

    if (netBudgetMins > 60) {
      const calcRawNeeds = (list: typeof activeSelection) => {
        let pLat = origin.latitude;
        let pLng = origin.longitude;
        let tMove = 0;
        let tStay = 0;
        for (const item of list) {
          const d = calculateDistanceMeters(pLat, pLng, item.place.latitude, item.place.longitude);
          tMove += estimateTravelMins(d, travelMode);
          tStay += item.place.estimated_stay_mins || 60;
          pLat = item.place.latitude;
          pLng = item.place.longitude;
        }
        if (endAnchor && list.length > 0) {
          const last = list[list.length - 1].place;
          const dBack = calculateDistanceMeters(last.latitude, last.longitude, endAnchor.latitude, endAnchor.longitude);
          tMove += estimateTravelMins(dBack, travelMode);
        }
        return { tMove, tStay };
      };

      let { tMove, tStay } = calcRawNeeds(activeSelection);
      // Drop non-pinned stops (from the end, but never the final souvenir/anchor stop) while the day is badly over budget
      while (
        tMove + tStay > netBudgetMins * 1.5 &&
        activeSelection.length > 2
      ) {
        let dropIdx = -1;
        for (let k = activeSelection.length - 2; k >= 0; k--) {
          if (!activeSelection[k].isPinned) {
            dropIdx = k;
            break;
          }
        }
        if (dropIdx === -1) break;
        const dropped = activeSelection.splice(dropIdx, 1)[0];
        excludedClosedPlaces.push({
          name: dropped.place.name,
          reason: `配合 ${returnDepartureTime} ${deadlineWord}，時間不夠而自動精簡此站`,
        });
        ({ tMove, tStay } = calcRawNeeds(activeSelection));
      }
      if (tMove + tStay > netBudgetMins && netBudgetMins < 155 && activeSelection.length > 3) {
        // Very tight window (< 2.5h net): drop the afternoon tea stop or museum stop if not pinned
        const dropIdx = activeSelection.findIndex((s, idx) => idx === 2 && !s.isPinned);
        if (dropIdx !== -1) {
          const dropped = activeSelection.splice(dropIdx, 1)[0];
          excludedClosedPlaces.push({
            name: dropped.place.name,
            reason: `配合 ${returnDepartureTime} ${deadlineWord}，自動精簡此站以確保準時`,
          });
          ({ tMove, tStay } = calcRawNeeds(activeSelection));
        }
      }

      if (tMove + tStay > netBudgetMins) {
        const availableForStay = Math.max(60, netBudgetMins - tMove);
        stayScaleFactor = Math.max(0.5, Math.min(1.0, availableForStay / tStay));
        timeFitNote = isStationEnd || !endAnchor
          ? `⏱️ 已依「${startTime} 出發 ～ ${returnDepartureTime} 發車（預留 ${STATION_BUFFER_MINS} 分鐘進站）」自動濃縮各站停留時間，確保準時搭上車！`
          : `⏱️ 已依「${startTime} 出門 ～ ${returnDepartureTime} 回到飯店」自動濃縮各站停留時間。`;
      } else {
        timeFitNote = isStationEnd || !endAnchor
          ? `✅ 時間充裕：${startTime} 出發，行程結束抵達車站後距離 ${returnDepartureTime} 發車還有充裕緩衝！`
          : `✅ 時間充裕：${startTime} 出門，預計 ${returnDepartureTime} 前輕鬆回到飯店休息。`;
      }
    }
  }

  let currentClock = startTime;
  let prevLat = origin.latitude;
  let prevLng = origin.longitude;
  let totalTravelMins = 0;
  let totalDistanceMeters = 0;
  let totalStayMins = 0;

  const stops: ItineraryStop[] = [];
  const usedIds = new Set(activeSelection.map((s) => s.place.id));

  for (let i = 0; i < activeSelection.length; i++) {
    const { place, isPinned } = activeSelection[i];
    const distFromPrev = calculateDistanceMeters(
      prevLat,
      prevLng,
      place.latitude,
      place.longitude
    );
    const travelMins = estimateTravelMins(distFromPrev, travelMode);
    const arrivalTime = addMinutesToTime(currentClock, travelMins);
    const rawStay = place.estimated_stay_mins || 60;
    const stayMins =
      stayScaleFactor < 0.99
        ? Math.max(15, Math.round((rawStay * stayScaleFactor) / 5) * 5)
        : rawStay;
    const departureTime = addMinutesToTime(arrivalTime, stayMins);

    const openCheck = checkPlaceOpenAtTime(
      place.opening_hours_json,
      place.business_status,
      arrivalTime
    );

    const nextStopPlace =
      i + 1 < activeSelection.length
        ? activeSelection[i + 1].place
        : endAnchor || null;

    const alternatives = allNearbyCandidates
      .filter(
        (cand) =>
          cand.id !== place.id &&
          !usedIds.has(cand.id) &&
          cand.sub_category === place.sub_category
      )
      .map((cand) => {
        const dPrev = calculateDistanceMeters(
          prevLat,
          prevLng,
          cand.latitude,
          cand.longitude
        );
        const dNext = nextStopPlace
          ? calculateDistanceMeters(
              cand.latitude,
              cand.longitude,
              nextStopPlace.latitude,
              nextStopPlace.longitude
            )
          : 0;
        const t = estimateTravelMins(dPrev, travelMode);
        const altArr = addMinutesToTime(currentClock, t);
        const altOpen = checkPlaceOpenAtTime(
          cand.opening_hours_json,
          cand.business_status,
          altArr
        );
        return {
          place: cand,
          distance_from_prev_meters: dPrev,
          chain_score: dPrev + dNext * 0.75,
          travel_mins_from_prev: t,
          open_status_note: altOpen.note,
        };
      })
      .sort((a, b) => a.chain_score - b.chain_score)
      .slice(0, 4);

    const distToHotel =
      endAnchor && i === activeSelection.length - 1
        ? calculateDistanceMeters(
            place.latitude,
            place.longitude,
            endAnchor.latitude,
            endAnchor.longitude
          )
        : null;
    const minsToHotel =
      distToHotel !== null ? estimateTravelMins(distToHotel, travelMode) : null;

    const anchorActionLabel =
      endAnchor?.anchor_type === 'hsr'
        ? '🚄【搭高鐵前順路最後一站】'
        : endAnchor?.anchor_type === 'train'
        ? '🚆【搭火車前順路最後一站】'
        : '🏨【回飯店前順路最後一站】';

    const scaleSuffix =
      stayMins < rawStay
        ? `（⏱️ 配合 ${returnDepartureTime} 班次，停留由 ${rawStay}分 彈性調整為 ${stayMins}分）`
        : '';

    const aiReason = isPinned
      ? `📌【已鎖定您的指定店家】依您的指令安排於 ${arrivalTime} 抵達「${place.name}」，並自動將前後站點收斂在同一順路走廊上（距上一站僅 ${distFromPrev}m / ${travelMins} 分鐘）${scaleSuffix}。`
      : i === activeSelection.length - 1 && endAnchor
      ? `${anchorActionLabel}特別挑選位在「${endAnchor.name}」順路廊道上的伴手禮名店，採買完僅需 ${minsToHotel} 分鐘 (${distToHotel}m) 即可直接抵達終點${scaleSuffix}！`
      : i === activeSelection.length - 1 && place.sub_category === 'souvenir'
      ? `排在行程最後一站採買伴手禮，免去旅途提重物負擔；且從上一站順路過來僅 ${distFromPrev} 公尺（${travelMins} 分鐘）${scaleSuffix}。`
      : `全域順路最佳解：介於前後站點動線走廊上，移動僅 ${travelMins} 分鐘 (${distFromPrev}m)，不走回頭路${scaleSuffix}。`;

    stops.push({
      stop_order: i + 1,
      place,
      arrival_time: arrivalTime,
      departure_time: departureTime,
      stay_mins: stayMins,
      travel_mins_from_prev: travelMins,
      distance_meters_from_prev: distFromPrev,
      is_open_at_arrival: openCheck.isOpen,
      open_status_note: openCheck.note,
      ai_reason: aiReason,
      alternatives,
    });

    currentClock = departureTime;
    prevLat = place.latitude;
    prevLng = place.longitude;
    totalTravelMins += travelMins;
    totalDistanceMeters += distFromPrev;
    totalStayMins += stayMins;
  }

  let endAnchorSummary = null;
  if (endAnchor && stops.length > 0) {
    const lastStop = stops[stops.length - 1].place;
    const distBack = calculateDistanceMeters(
      lastStop.latitude,
      lastStop.longitude,
      endAnchor.latitude,
      endAnchor.longitude
    );
    const minsBack = estimateTravelMins(distBack, travelMode);
    totalDistanceMeters += distBack;
    totalTravelMins += minsBack;
    const finalArrTime = addMinutesToTime(currentClock, minsBack);
    const mustArriveBy = returnDepartureTime
      ? addMinutesToTime(returnDepartureTime, -STATION_BUFFER_MINS)
      : null;
    const bufferRemaining = returnDepartureTime
      ? timeStrToMins(returnDepartureTime) - timeStrToMins(finalArrTime)
      : null;

    endAnchorSummary = {
      name: endAnchor.name,
      anchor_type: endAnchor.anchor_type,
      latitude: endAnchor.latitude,
      longitude: endAnchor.longitude,
      distance_from_last_stop_meters: distBack,
      travel_mins_from_last_stop: minsBack,
      arrival_time: finalArrTime,
      return_departure_time: returnDepartureTime || null,
      must_arrive_by: mustArriveBy,
      buffer_mins_remaining: bufferRemaining,
      time_fit_note: timeFitNote,
    };
  }

  return {
    id: planId,
    title,
    subtitle,
    total_duration_mins: totalTravelMins + totalStayMins,
    total_travel_mins: totalTravelMins,
    total_distance_meters: totalDistanceMeters,
    travel_mode: travelMode,
    start_time: startTime,
    return_departure_time: returnDepartureTime || null,
    time_fit_note: timeFitNote,
    must_arrive_by:
      returnDepartureTime && (isStationEnd || !endAnchor)
        ? addMinutesToTime(returnDepartureTime, -STATION_BUFFER_MINS)
        : null,
    origin,
    end_anchor: endAnchorSummary,
    stops,
    google_maps_nav_url: buildGoogleMapsDirUrl(
      origin,
      stops.map((s) => s.place),
      travelMode,
      endAnchor
    ),
    refreshed_candidates_count: refreshedCount,
    excluded_closed_places: excludedClosedPlaces,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const allPlaces: SavedPlace[] = body.places || [];
    // strictDay = request comes from the multi-day planner with explicit per-day params;
    // don't re-derive times / anchors / mode from the whole-trip text.
    const strictDay: boolean = Boolean(body.strictDay);
    let origin = body.origin || {
      name: PRESET_DESTINATIONS[0].label,
      latitude: PRESET_DESTINATIONS[0].latitude,
      longitude: PRESET_DESTINATIONS[0].longitude,
    };
    let radiusMeters: number = body.radiusMeters || 5000;
    let startTime: string = body.startTime || '14:00';
    let travelMode: TravelMode = body.travelMode || 'WALK';
    const intentText: string = body.intentText || '';
    const intentBlocks: IntentStepBlock[] = body.intentBlocks || [];

    // 1. Natural language transport mode detection
    if (strictDay) {
      if (travelMode === 'SCOOTER') radiusMeters = Math.max(radiusMeters, 8000);
      if (travelMode === 'DRIVE') radiusMeters = Math.max(radiusMeters, 12000);
    } else if (/機車|騎車|摩托車|租車|騎機車/.test(intentText)) {
      travelMode = 'SCOOTER';
      radiusMeters = Math.max(radiusMeters, 8000);
    } else if (/開車|自駕|汽車/.test(intentText)) {
      travelMode = 'DRIVE';
      radiusMeters = Math.max(radiusMeters, 12000);
    } else if (/步行|走路|散步|近一點/.test(intentText)) {
      travelMode = 'WALK';
    } else if (/公車|捷運|大眾運輸/.test(intentText)) {
      travelMode = 'TRANSIT';
    }

    // 2. Natural language destination detection across all preset cities
    let targetCity = body.origin?.city || '台南市';
    if (!strictDay) {
      for (const dest of PRESET_DESTINATIONS) {
        const cityClean = dest.city.replace('市', '').replace('縣', '').replace('府', '');
        const distClean = dest.district.replace('區', '').replace('鄉', '').replace('鎮', '');
        const regex = new RegExp(`${dest.city}|${cityClean}|${dest.district}|${distClean}`);
        if (regex.test(intentText)) {
          targetCity = dest.city;
          if (!body.origin || !body.origin.latitude) {
            origin = {
              name: dest.label,
              latitude: dest.latitude,
              longitude: dest.longitude,
            };
          }
          break;
        }
      }
    }

    // 3. Extract Overnight Hotel / End-Anchor if mentioned (e.g. "今天晚上住在台南大飯店")
    const endAnchor = strictDay
      ? body.endAnchor || null
      : body.endAnchor || extractHotelEndAnchor(intentText, targetCity);

    // If user stays at a hotel, also set origin to that hotel (or station nearby) if they are starting their day or ending their day there
    if (endAnchor && !strictDay) {
      origin = {
        name: `${endAnchor.name}（出發／回程起訖點）`,
        latitude: endAnchor.latitude,
        longitude: endAnchor.longitude,
      };
    }

    // Center used for "nearby" filtering (multi-day: hotel / city center rather than a far-away HSR station)
    const searchCenter: { latitude: number; longitude: number } =
      body.searchCenter && typeof body.searchCenter.latitude === 'number'
        ? body.searchCenter
        : origin;

    // Check if user requested a specific compact district (e.g. "中西區", "鹽埕區")
    const districtLockMatch = intentText.match(/(中西區|鹽埕區|大同區|台東區|安平區)/);
    const preferredDistrict = districtLockMatch ? districtLockMatch[1] : null;
    const isCompactWalkRequested =
      travelMode === 'WALK' || (!strictDay && /近一點|步行|走路/.test(intentText));

    if (!strictDay && /中餐|午餐|中午|一日遊|旅遊|白天/.test(intentText) && startTime === '14:00') {
      startTime = '10:00';
    }

    const { parsedArrivalTime, parsedDepartureTime } = strictDay
      ? { parsedArrivalTime: null, parsedDepartureTime: null }
      : extractTimesFromPrompt(intentText);
    if (parsedArrivalTime) {
      startTime = parsedArrivalTime;
    }
    const returnDepartureTime: string | null =
      body.returnDepartureTime || parsedDepartureTime || null;
    const endBufferMins: number | undefined =
      typeof body.endBufferMins === 'number' ? body.endBufferMins : undefined;

    const { pinnedBySubCat, excludedIdsInPrompt } = parsePromptConstraints(
      intentText,
      allPlaces
    );
    const sequence =
      strictDay && intentBlocks.length > 0
        ? intentBlocks
        : parseIntentSequenceFromText(intentText, intentBlocks, pinnedBySubCat);

    const excludedClosedPlaces: Array<{ name: string; reason: string }> = [];
    const spatialCandidates: SavedPlace[] = [];

    for (const p of allPlaces) {
      const dist = calculateDistanceMeters(
        searchCenter.latitude,
        searchCenter.longitude,
        p.latitude,
        p.longitude
      );
      if (dist > radiusMeters) continue;

      const isExplicitlyPinned = Array.from(pinnedBySubCat.values()).some(
        (pin) => pin.id === p.id
      );
      if (
        isCompactWalkRequested &&
        !isExplicitlyPinned &&
        ((preferredDistrict && p.district !== preferredDistrict) || dist > 1400)
      ) {
        excludedClosedPlaces.push({
          name: p.name,
          reason: `距離起點 ${(dist / 1000).toFixed(1)}km（${p.district}），超出「🚶 步行近距離街區」範圍，改於🛵機車模式解鎖`,
        });
        continue;
      }

      if (excludedIdsInPrompt.has(p.id)) {
        excludedClosedPlaces.push({
          name: p.name,
          reason: '依您的指令「不想去」已排除並自動替換順路店',
        });
        continue;
      }

      if (p.visit_status === 'visited_skip' && !isExplicitlyPinned) {
        excludedClosedPlaces.push({
          name: p.name,
          reason: '已標記「去過不推」，自動略過',
        });
        continue;
      }
      if (p.business_status === 'CLOSED_PERMANENTLY') {
        excludedClosedPlaces.push({
          name: p.name,
          reason: 'Google 營業狀態為「已永久歇業」，自動排除',
        });
        continue;
      }

      spatialCandidates.push({
        ...p,
        distance_meters: dist,
      });
    }

    // Global Beam-Search Route Optimizer: adapts scoring by travelMode AND endAnchor (return to hotel/station!)
    type PathNode = {
      picks: Array<{
        place: SavedPlace;
        stepBlock: IntentStepBlock;
        isPinned: boolean;
      }>;
      usedIds: Set<string>;
      lastLat: number;
      lastLng: number;
      totalScore: number;
    };

    let beam: PathNode[] = [
      {
        picks: [],
        usedIds: new Set<string>(),
        lastLat: origin.latitude,
        lastLng: origin.longitude,
        totalScore: 0,
      },
    ];

    for (let stepIdx = 0; stepIdx < sequence.length; stepIdx++) {
      const block = sequence[stepIdx];
      const isLastStep = stepIdx === sequence.length - 1;
      const isSecondToLastStep = stepIdx === sequence.length - 2;
      const pinnedPlace = block.sub_category
        ? pinnedBySubCat.get(block.sub_category)
        : undefined;

      const nextBlock =
        stepIdx + 1 < sequence.length ? sequence[stepIdx + 1] : undefined;
      const nextPinned = nextBlock?.sub_category
        ? pinnedBySubCat.get(nextBlock.sub_category)
        : undefined;

      const nextBeam: PathNode[] = [];

      for (const branch of beam) {
        let pool: SavedPlace[] = [];
        let isPinnedFlag = false;

        if (pinnedPlace && !branch.usedIds.has(pinnedPlace.id)) {
          pool = [pinnedPlace];
          isPinnedFlag = true;
        } else {
          pool = spatialCandidates.filter((cand) => {
            if (branch.usedIds.has(cand.id)) return false;
            if (block.sub_category && cand.sub_category !== block.sub_category)
              return false;
            if (block.only_unvisited && cand.visit_status !== 'unvisited')
              return false;
            return true;
          });
          if (pool.length === 0 && block.only_unvisited) {
            pool = spatialCandidates.filter(
              (cand) =>
                !branch.usedIds.has(cand.id) &&
                cand.sub_category === block.sub_category
            );
          }
        }

        if (pool.length === 0) {
          nextBeam.push(branch);
          continue;
        }

        for (const cand of pool) {
          const legDist = calculateDistanceMeters(
            branch.lastLat,
            branch.lastLng,
            cand.latitude,
            cand.longitude
          );
          const lookaheadDist = nextPinned
            ? calculateDistanceMeters(
                cand.latitude,
                cand.longitude,
                nextPinned.latitude,
                nextPinned.longitude
              ) * 0.45
            : 0;

          let modeScore = legDist;
          if (travelMode === 'WALK') {
            modeScore = legDist > 750 ? legDist * 2.6 : legDist * 1.2;
          } else if (travelMode === 'SCOOTER' || travelMode === 'DRIVE') {
            modeScore = legDist * 0.35;
            const hasScooterTag = (cand.custom_tags || []).some((t) =>
              /機車|跨區|好停|保冷/.test(t)
            );
            if (hasScooterTag && !(endAnchor && isLastStep)) {
              modeScore -= 650;
            }
            if ((cand.rating || 0) >= 4.6) modeScore -= 250;
          }

          let hotelReturnPenalty = 0;
          if (endAnchor) {
            const distToHotel = calculateDistanceMeters(
              cand.latitude,
              cand.longitude,
              endAnchor.latitude,
              endAnchor.longitude
            );
            if (isLastStep) {
              hotelReturnPenalty = distToHotel * 2.2;
            } else if (isSecondToLastStep) {
              hotelReturnPenalty = distToHotel * 0.55;
            }
          }

          const unvisitedBonus =
            cand.visit_status === 'unvisited' ? -120 : 0;

          const nextUsed = new Set(branch.usedIds);
          nextUsed.add(cand.id);

          nextBeam.push({
            picks: [
              ...branch.picks,
              { place: cand, stepBlock: block, isPinned: isPinnedFlag },
            ],
            usedIds: nextUsed,
            lastLat: cand.latitude,
            lastLng: cand.longitude,
            totalScore:
              branch.totalScore +
              modeScore +
              lookaheadDist +
              hotelReturnPenalty +
              unvisitedBonus,
          });
        }
      }

      nextBeam.sort((a, b) => a.totalScore - b.totalScore);
      beam = nextBeam.slice(0, 8);
    }

    const bestBranch = beam[0];
    const bestKey = bestBranch?.picks.map((p) => p.place.id).join(',') || '';
    const secondBranch =
      beam.find((b) => b.picks.map((p) => p.place.id).join(',') !== bestKey) ||
      beam[1];

    const modeBadge =
      travelMode === 'SCOOTER'
        ? '🛵 機車跨區順路版'
        : travelMode === 'DRIVE'
        ? '🚗 汽車自駕版'
        : '🚶 步行街區密集版';

    const plans: ItineraryPlan[] = [];
    if (bestBranch && bestBranch.picks.length > 0) {
      plans.push(
        buildPlanFromSelectedStops({
          planId: 'plan-a-optimal',
          title: endAnchor
            ? `方案 A｜${modeBadge}＋終點順路回「${endAnchor.name.replace('🏨 ', '')}」`
            : `方案 A｜${modeBadge}（全域順路不走回頭路）`,
          subtitle: endAnchor
            ? `白天騎車跨區暢遊，下午至最後一站自動往「${endAnchor.name}」方向收斂，買完伴手禮直接抵達終點！`
            : travelMode === 'SCOOTER'
            ? '發揮機車機動性！跨區串聯高分名店與好停車景點，沿同一方向順行不折返'
            : '專為步行最佳化！鎖定核心街區 300m–600m 內高密度景點，輕鬆散步不鐵腿',
          origin,
          endAnchor,
          startTime,
          returnDepartureTime,
          travelMode,
          selectedPlaces: bestBranch.picks,
          allNearbyCandidates: spatialCandidates,
          refreshedCount: spatialCandidates.length,
          excludedClosedPlaces,
          endBufferMins,
        })
      );
    }

    if (secondBranch && secondBranch.picks.length > 0) {
      plans.push(
        buildPlanFromSelectedStops({
          planId: 'plan-b-discovery',
          title: `方案 B｜${modeBadge}・另一條順路組合`,
          subtitle: '保留您的指定條件與住宿終點，提供另一組不同店家的順路動線',
          origin,
          endAnchor,
          startTime,
          returnDepartureTime,
          travelMode,
          selectedPlaces: secondBranch.picks,
          allNearbyCandidates: spatialCandidates,
          refreshedCount: spatialCandidates.length,
          excludedClosedPlaces,
          endBufferMins,
        })
      );
    }

    return NextResponse.json({
      plans,
      parsedSequence: sequence,
      candidateCount: spatialCandidates.length,
      excludedClosedPlaces,
    });
  } catch (error) {
    console.error('Chain itinerary error:', error);
    return NextResponse.json(
      { error: '串聯行程運算失敗，請稍後再試' },
      { status: 500 }
    );
  }
}
