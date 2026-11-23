import { PRESET_DESTINATIONS } from '@/lib/default-data';
import { IntentStepBlock, ItineraryPlan, TravelMode } from '@/types/place';

export type AnchorType = 'hotel' | 'hsr' | 'train' | 'center';

export interface TripAnchor {
  id: string;
  name: string;
  anchor_type: AnchorType;
  latitude: number;
  longitude: number;
  /** Far-away stations (e.g. 高鐵台南站 in 歸仁) need a transfer into the city */
  transfer?: {
    mins: number;
    note: string;
    viaName: string;
    viaLat: number;
    viaLng: number;
  };
  /** Custom hotel typed by the user whose coordinates still need lookup */
  needsGeocode?: boolean;
}

export type DayKind = 'single' | 'arrival' | 'middle' | 'departure';
export type SingleDayEnd = 'none' | 'hotel' | 'station';

import { WEEKDAY_LABELS } from '@/lib/opening-hours';

export interface TripDay {
  id: string;
  dayIndex: number;
  dateStr: string;   // "YYYY-MM-DD"
  dayOfWeek: number; // 0 = Sun, 1 = Mon, ..., 6 = Sat
  kind: DayKind;
  startAnchor: TripAnchor;
  endAnchor: TripAnchor | null;
  startTime: string;
  /** Hotel return time (hotel end) or train departure time (station end); '' = open-ended */
  endTime: string;
  plans: ItineraryPlan[];
  activePlanIndex: number;
  error?: string | null;
}

export interface TripState {
  destId: string;
  numDays: number;
  startDate: string; // "YYYY-MM-DD"
  hotel: TripAnchor;
  customHotels: TripAnchor[];
  arrivalStationId: string; // '' = 不指定（從市區出發）
  departureStationId: string; // '' = 不指定
  arrivalTime: string;
  departureTime: string;
  dailyStart: string;
  dailyEnd: string;
  singleDayEnd: SingleDayEnd;
  travelMode: TravelMode;
  days: TripDay[];
  activeDayIndex: number;
}

export const TRIP_STORAGE_KEY = 'wayfinder_trip_v1';

export function getLocalDateStr(offsetDays = 0): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysToDateStr(baseDateStr: string, offsetDays: number): string {
  const m = (baseDateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

export function getDayOfWeekFromDateStr(dateStr?: string): number {
  const m = (dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return 1;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0).getDay();
}

export function formatShortDateWithWeekday(dateStr?: string, dayOfWeek?: number): string {
  const m = (dateStr || '').match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!m && (dayOfWeek === undefined || !Number.isFinite(dayOfWeek))) {
    return '選擇日期';
  }
  const dow =
    typeof dayOfWeek === 'number' && Number.isFinite(dayOfWeek)
      ? ((dayOfWeek % 7) + 7) % 7
      : getDayOfWeekFromDateStr(dateStr);
  const md = m ? `${Number(m[1])}/${Number(m[2])} ` : '';
  return `${md}${WEEKDAY_LABELS[dow]}`;
}

// ---------------------------------------------------------------------------
// Stations & hotels per city
// ---------------------------------------------------------------------------

export const CITY_STATIONS: Record<string, TripAnchor[]> = {
  台南市: [
    {
      id: 'tn-hsr',
      name: '🚄 高鐵台南站',
      anchor_type: 'hsr',
      latitude: 22.9251,
      longitude: 120.2858,
      transfer: {
        mins: 25,
        note: '搭台鐵沙崙線轉乘進市區',
        viaName: '🚆 台南火車站',
        viaLat: 22.9972,
        viaLng: 120.2125,
      },
    },
    {
      id: 'tn-tra',
      name: '🚆 台南火車站',
      anchor_type: 'train',
      latitude: 22.9972,
      longitude: 120.2125,
    },
  ],
  高雄市: [
    {
      id: 'kh-hsr',
      name: '🚄 高鐵左營站',
      anchor_type: 'hsr',
      latitude: 22.6874,
      longitude: 120.3075,
      transfer: {
        mins: 20,
        note: '搭捷運紅線轉乘進市區',
        viaName: '🚆 高雄車站',
        viaLat: 22.6396,
        viaLng: 120.3026,
      },
    },
    {
      id: 'kh-tra',
      name: '🚆 高雄車站',
      anchor_type: 'train',
      latitude: 22.6396,
      longitude: 120.3026,
    },
  ],
  台中市: [
    {
      id: 'tc-hsr',
      name: '🚄 高鐵台中站',
      anchor_type: 'hsr',
      latitude: 24.1121,
      longitude: 120.6158,
      transfer: {
        mins: 15,
        note: '經新烏日站轉乘台鐵進市區',
        viaName: '🚆 台中車站',
        viaLat: 24.1372,
        viaLng: 120.6869,
      },
    },
    {
      id: 'tc-tra',
      name: '🚆 台中車站',
      anchor_type: 'train',
      latitude: 24.1372,
      longitude: 120.6869,
    },
  ],
  台北市: [
    {
      id: 'tp-main',
      name: '🚄 台北車站（高鐵／台鐵）',
      anchor_type: 'hsr',
      latitude: 25.0478,
      longitude: 121.517,
    },
  ],
  嘉義市: [
    {
      id: 'cy-hsr',
      name: '🚄 高鐵嘉義站',
      anchor_type: 'hsr',
      latitude: 23.4593,
      longitude: 120.3232,
      transfer: {
        mins: 30,
        note: '搭 BRT 轉乘進市區',
        viaName: '🚆 嘉義火車站',
        viaLat: 23.4791,
        viaLng: 120.441,
      },
    },
    {
      id: 'cy-tra',
      name: '🚆 嘉義火車站',
      anchor_type: 'train',
      latitude: 23.4791,
      longitude: 120.441,
    },
  ],
  宜蘭縣: [
    {
      id: 'yl-jx',
      name: '🚆 礁溪火車站',
      anchor_type: 'train',
      latitude: 24.827,
      longitude: 121.7745,
    },
    {
      id: 'yl-yl',
      name: '🚆 宜蘭火車站',
      anchor_type: 'train',
      latitude: 24.7547,
      longitude: 121.7581,
    },
  ],
  花蓮縣: [
    {
      id: 'hl-tra',
      name: '🚆 花蓮火車站',
      anchor_type: 'train',
      latitude: 23.9929,
      longitude: 121.6011,
    },
  ],
};

export const CITY_HOTELS: Record<string, TripAnchor[]> = {
  台南市: [
    { id: 'tn-h-grand', name: '🏨 台南大飯店', anchor_type: 'hotel', latitude: 22.9946, longitude: 120.2103 },
    { id: 'tn-h-silks', name: '🏨 台南晶英酒店', anchor_type: 'hotel', latitude: 22.9878, longitude: 120.1992 },
    { id: 'tn-h-hotelcozzi', name: '🏨 和逸飯店 台南西門館', anchor_type: 'hotel', latitude: 22.9866, longitude: 120.1977 },
  ],
  高雄市: [
    { id: 'kh-h-yancheng', name: '🏨 高雄鹽埕翰品酒店', anchor_type: 'hotel', latitude: 22.6248, longitude: 120.2862 },
    { id: 'kh-h-grandhi', name: '🏨 高雄漢來大飯店', anchor_type: 'hotel', latitude: 22.6205, longitude: 120.2967 },
  ],
  台中市: [
    { id: 'tc-h-millennium', name: '🏨 台中千禧酒店（草悟道）', anchor_type: 'hotel', latitude: 24.1527, longitude: 120.6628 },
  ],
  台北市: [
    { id: 'tp-h-cosmos', name: '🏨 台北天成大飯店（台北車站）', anchor_type: 'hotel', latitude: 25.0464, longitude: 121.5165 },
  ],
  嘉義市: [
    { id: 'cy-h-maison', name: '🏨 嘉義市區飯店（文化路）', anchor_type: 'hotel', latitude: 23.4802, longitude: 120.4489 },
  ],
  宜蘭縣: [
    { id: 'yl-h-jiaoxi', name: '🏨 礁溪溫泉飯店', anchor_type: 'hotel', latitude: 24.8263, longitude: 121.7718 },
  ],
  花蓮縣: [
    { id: 'hl-h-city', name: '🏨 花蓮市區飯店（東大門）', anchor_type: 'hotel', latitude: 23.9776, longitude: 121.6064 },
  ],
};

export function getDest(destId: string) {
  return (
    PRESET_DESTINATIONS.find((d) => d.id === destId) || PRESET_DESTINATIONS[0]
  );
}

export function cityCenterAnchor(destId: string): TripAnchor {
  const dest = getDest(destId);
  return {
    id: `center-${dest.id}`,
    name: `📍 ${dest.shortLabel}（市區）`,
    anchor_type: 'center',
    latitude: dest.latitude,
    longitude: dest.longitude,
  };
}

export function stationsForDest(destId: string): TripAnchor[] {
  return CITY_STATIONS[getDest(destId).city] || [];
}

export function hotelsForTrip(trip: TripState): TripAnchor[] {
  const list = [
    trip.hotel,
    ...(CITY_HOTELS[getDest(trip.destId).city] || []),
    ...trip.customHotels,
  ];
  const seen = new Set<string>();
  return list.filter((h) => {
    if (!h || seen.has(h.id)) return false;
    seen.add(h.id);
    return true;
  });
}

export function defaultHotelForDest(destId: string): TripAnchor {
  const dest = getDest(destId);
  return (
    CITY_HOTELS[dest.city]?.[0] || {
      id: `hotel-${dest.id}`,
      name: `🏨 ${dest.shortLabel} 住宿`,
      anchor_type: 'hotel',
      latitude: dest.latitude,
      longitude: dest.longitude,
    }
  );
}

// ---------------------------------------------------------------------------
// Time helpers
// ---------------------------------------------------------------------------

export function timeToMins(t: string): number {
  const [h, m] = (t || '00:00').split(':').map((n) => parseInt(n, 10) || 0);
  return h * 60 + m;
}

export function minsToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(mins)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(
    clamped % 60
  ).padStart(2, '0')}`;
}

export function nightsLabel(numDays: number): string {
  return numDays <= 1 ? '當天來回' : `${numDays} 天 ${numDays - 1} 夜`;
}

export const DAY_KIND_LABEL: Record<DayKind, string> = {
  single: '單日',
  arrival: '抵達日',
  middle: '暢遊日',
  departure: '回程日',
};

// ---------------------------------------------------------------------------
// Day skeleton builder
// ---------------------------------------------------------------------------

export function buildTripDays(trip: TripState): TripDay[] {
  const center = cityCenterAnchor(trip.destId);
  const stations = stationsForDest(trip.destId);
  const arrSt = stations.find((s) => s.id === trip.arrivalStationId) || null;
  const depSt = stations.find((s) => s.id === trip.departureStationId) || null;
  const n = Math.max(1, Math.min(7, trip.numDays));
  const baseDate =
    trip.startDate || (typeof window !== 'undefined' ? getLocalDateStr(1) : '');
  const days: TripDay[] = [];

  const mk = (
    dayIndex: number,
    kind: DayKind,
    startAnchor: TripAnchor,
    endAnchor: TripAnchor | null,
    startTime: string,
    endTime: string
  ): TripDay => {
    const dateStr = addDaysToDateStr(baseDate, dayIndex);
    return {
      id: `day-${dayIndex + 1}`,
      dayIndex,
      dateStr,
      dayOfWeek: getDayOfWeekFromDateStr(dateStr),
      kind,
      startAnchor,
      endAnchor,
      startTime,
      endTime,
      plans: [],
      activePlanIndex: 0,
      error: null,
    };
  };

  if (n === 1) {
    let end: TripAnchor | null = null;
    let endTime = '';
    if (trip.singleDayEnd === 'station' && depSt) {
      end = depSt;
      endTime = trip.departureTime || '17:00';
    } else if (trip.singleDayEnd === 'hotel') {
      end = trip.hotel;
      endTime = trip.dailyEnd || '20:00';
    }
    days.push(mk(0, 'single', arrSt || center, end, trip.arrivalTime || '10:00', endTime));
    return days;
  }

  days.push(
    mk(0, 'arrival', arrSt || center, trip.hotel, trip.arrivalTime || '10:00', trip.dailyEnd || '20:00')
  );
  for (let i = 1; i < n - 1; i++) {
    days.push(mk(i, 'middle', trip.hotel, trip.hotel, trip.dailyStart || '09:30', trip.dailyEnd || '20:00'));
  }
  days.push(
    mk(
      n - 1,
      'departure',
      trip.hotel,
      depSt,
      trip.dailyStart || '09:30',
      depSt ? trip.departureTime || '17:00' : ''
    )
  );
  return days;
}

/**
 * Category sequence for a day, sized to the day's time window so short days get fewer stops,
 * lunch/dinner only appear when the window covers meal time, and souvenirs are only bought
 * on the last day (no carrying bags around for days).
 */
export function buildDayBlocks(
  kind: DayKind,
  startTime: string,
  endTime: string
): IntentStepBlock[] {
  const s = timeToMins(startTime);
  const e = endTime ? timeToMins(endTime) : 21 * 60;
  const blocks: IntentStepBlock[] = [];
  const push = (
    id: string,
    label: string,
    primary_category: string,
    sub_category: string,
    only_unvisited = false
  ) =>
    blocks.push({ id, label, primary_category, sub_category, only_unvisited });

  if (s <= 11 * 60 && e >= 12 * 60) {
    push('d-museum', '🏛️ 上午：沒去過的展館', 'museum_culture', 'museum', true);
  }
  if (s <= 13 * 60 + 30 && e >= 12 * 60 + 30) {
    push('d-lunch', '🍴 午餐', 'restaurant', 'meal');
  }
  if (s <= 14 * 60 + 30 && e >= 17 * 60) {
    push('d-landmark', '⛩️ 下午：古蹟／地標', 'museum_culture', 'landmark');
  }
  if (s <= 16 * 60 && e >= 15 * 60 + 30) {
    push('d-snack', '☕ 下午茶／點心', 'restaurant', 'snack_dessert');
  }
  if (e >= 19 * 60 && s <= 18 * 60) {
    push('d-dinner', '🍽️ 晚餐', 'restaurant', 'meal');
  }
  if (kind === 'departure' || kind === 'single') {
    push('d-souvenir', '🎁 回程前買伴手禮', 'restaurant', 'souvenir');
  }
  if (blocks.length === 0) {
    push('d-meal', '🍴 用餐', 'restaurant', 'meal');
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Natural-language parsing (typed or spoken)
// ---------------------------------------------------------------------------

const CN_DIGIT: Record<string, number> = {
  零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

export function parseCnNumber(raw: string): number {
  const n = parseInt(raw, 10);
  if (!isNaN(n)) return n;
  if (raw in CN_DIGIT) return CN_DIGIT[raw];
  if (raw.startsWith('十')) return 10 + (CN_DIGIT[raw[1]] || 0);
  if (raw.length >= 2 && raw[1] === '十') {
    return (CN_DIGIT[raw[0]] || 0) * 10 + (CN_DIGIT[raw[2]] || 0);
  }
  return NaN;
}

export function parseNaturalTextControls(text: string): {
  times: string[];
  detectedStart?: string;
  detectedDep?: string;
  hasReturnKeyword: boolean;
  detectedMode?: TravelMode;
} {
  const clean = (text || '').trim();
  let detectedMode: TravelMode | undefined;
  if (/步行|走路|散步|用走的/.test(clean)) detectedMode = 'WALK';
  else if (/機車|騎車|摩托車|騎機車/.test(clean)) detectedMode = 'SCOOTER';
  else if (/開車|自駕|汽車/.test(clean)) detectedMode = 'DRIVE';

  const timeRegex =
    /(早上|上午|中午|下午|傍晚|晚上)?\s*(\d{1,2}|二十[一二三]?|十[一二三四五六七八九]?|[一二兩三四五六七八九])\s*(?:[:：點時])\s*(半|\d{1,2}|[一二三四五]十[一二三四五六七八九]?)?\s*分?/g;
  const times: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = timeRegex.exec(clean)) !== null) {
    const period = match[1] || '';
    let hh = parseCnNumber(match[2]);
    if (isNaN(hh)) continue;
    const minRaw = match[3] || '';
    let mm = 0;
    if (minRaw === '半') mm = 30;
    else if (minRaw) {
      const parsed = parseCnNumber(minRaw);
      mm = isNaN(parsed) ? 0 : parsed;
    }
    if ((period === '下午' || period === '傍晚' || period === '晚上') && hh < 12) hh += 12;
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      times.push(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    }
  }

  const hasReturnKeyword =
    /回程|回去|回台北|回家|坐高鐵回|搭高鐵回|坐火車回|搭火車回|離開|發車|的車/.test(clean);

  if (times.length >= 2) {
    return {
      times,
      detectedStart: times[0],
      detectedDep: hasReturnKeyword ? times[times.length - 1] : undefined,
      hasReturnKeyword,
      detectedMode,
    };
  }
  if (times.length === 1) {
    if (hasReturnKeyword && !/到|出發|抵達/.test(clean)) {
      return { times, detectedDep: times[0], hasReturnKeyword, detectedMode };
    }
    return { times, detectedStart: times[0], hasReturnKeyword, detectedMode };
  }
  return { times, hasReturnKeyword, detectedMode };
}

const RELATIVE_DAY: Array<[RegExp, number]> = [
  [/大後天/, 3],
  [/後天/, 2],
  [/明天|明日/, 1],
  [/今天|今日/, 0],
];

export interface ParsedTripText {
  destId?: string;
  numDays?: number;
  startDate?: string;
  hotelName?: string;
  arrivalStationType?: 'hsr' | 'train';
  departureStationType?: 'hsr' | 'train';
  arrivalTime?: string;
  departureTime?: string;
  travelMode?: TravelMode;
  singleDayEnd?: SingleDayEnd;
}

const CN_WEEKDAY_MAP: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

export function parseTripFromText(text: string): ParsedTripText {
  const clean = (text || '').trim();
  const out: ParsedTripText = {};
  if (!clean) return out;

  // Start date: explicit weekday ("下週三" / "週一" / "星期六") or relative day ("今天"/"明天"/"後天"/"大後天")
  if (typeof window !== 'undefined') {
    const wdMatch = clean.match(/(下個?|這個?|本)?(?:星期|週|周|禮拜)([日天一二三四五六])/);
    if (wdMatch) {
      const prefix = wdMatch[1] || '';
      const targetDow = CN_WEEKDAY_MAP[wdMatch[2]];
      if (targetDow !== undefined) {
        const todayDow = new Date().getDay();
        let diff = (targetDow - todayDow + 7) % 7;
        if (prefix.startsWith('下')) {
          diff = diff === 0 ? 7 : diff + (targetDow <= todayDow ? 0 : 7);
        }
        out.startDate = getLocalDateStr(diff);
      }
    } else {
      for (const [re, offset] of RELATIVE_DAY) {
        if (re.test(clean)) {
          out.startDate = getLocalDateStr(offset);
          break;
        }
      }
    }
  }

  // Destination: earliest-mentioned preset city/district
  let bestIdx = Infinity;
  for (const dest of PRESET_DESTINATIONS) {
    const cityShort = dest.city.replace(/[市縣府]$/, '');
    const distShort = dest.district.replace(/[區鄉鎮]$/, '');
    const re = new RegExp(`${dest.city}|${cityShort}|${dest.district}|${distShort}`);
    const m = re.exec(clean);
    if (m && m.index < bestIdx) {
      bestIdx = m.index;
      out.destId = dest.id;
    }
  }

  // Number of days
  const NUM = '(\\d|[一二兩三四五六七])';
  const dn = clean.match(new RegExp(`${NUM}\\s*天\\s*${NUM}\\s*夜`));
  const nights = clean.match(new RegExp(`住(?:個)?\\s*${NUM}\\s*晚|${NUM}\\s*晚`));
  const dayTrip = clean.match(new RegExp(`${NUM}\\s*日遊`));
  const nthDay = Array.from(clean.matchAll(new RegExp(`第\\s*${NUM}\\s*天`, 'g')))
    .map((m) => parseCnNumber(m[1]))
    .filter((n) => !isNaN(n));
  if (dn) {
    out.numDays = parseCnNumber(dn[1]);
  } else if (nights) {
    const n = parseCnNumber(nights[1] || nights[2]);
    if (!isNaN(n)) out.numDays = n + 1;
  } else if (dayTrip) {
    out.numDays = parseCnNumber(dayTrip[1]);
  } else if (nthDay.length > 0) {
    out.numDays = Math.max(...nthDay);
  } else if (/過夜|住一晚/.test(clean)) {
    out.numDays = 2;
  } else {
    const found = RELATIVE_DAY.map(([re, d]) => {
      const m = re.exec(clean);
      return m ? { idx: m.index, d } : null;
    }).filter(Boolean) as Array<{ idx: number; d: number }>;
    // 後天 also matches inside 大後天; de-duplicate by position
    const unique = found.filter(
      (f, i) => !found.some((g, j) => j !== i && g.idx <= f.idx && g.idx + 3 > f.idx && g.d > f.d)
    );
    if (unique.length >= 2) {
      const ds = unique.map((u) => u.d);
      out.numDays = Math.max(...ds) - Math.min(...ds) + 1;
    } else if (/當天來回|一日遊/.test(clean)) {
      out.numDays = 1;
    }
  }
  if (out.numDays !== undefined && (isNaN(out.numDays) || out.numDays < 1)) {
    delete out.numDays;
  } else if (out.numDays) {
    out.numDays = Math.min(7, out.numDays);
  }

  // Hotel
  const hotelMatch = clean.match(
    /住(?:在)?\s*([^\s，,。！!？?、]{2,14}?(?:大飯店|飯店|酒店|民宿|商旅|旅店|旅館|會館|行館|Hotel|hotel))/
  );
  if (hotelMatch) out.hotelName = hotelMatch[1];

  // Stations: first mention = arrival, last mention = departure
  const stationMentions = Array.from(clean.matchAll(/高鐵|火車|台鐵|臺鐵/g)).map((m) =>
    m[0] === '高鐵' ? ('hsr' as const) : ('train' as const)
  );
  if (stationMentions.length > 0) {
    out.arrivalStationType = stationMentions[0];
    out.departureStationType = stationMentions[stationMentions.length - 1];
  }

  const ctrl = parseNaturalTextControls(clean);
  if (ctrl.detectedStart) out.arrivalTime = ctrl.detectedStart;
  if (ctrl.detectedDep) out.departureTime = ctrl.detectedDep;
  if (ctrl.detectedMode) out.travelMode = ctrl.detectedMode;

  // Single-day ending
  if ((out.numDays ?? 1) === 1) {
    if (ctrl.detectedDep && stationMentions.length > 0) out.singleDayEnd = 'station';
    else if (out.hotelName) out.singleDayEnd = 'hotel';
    else if (ctrl.detectedDep) out.singleDayEnd = 'station';
    else out.singleDayEnd = 'none';
  }

  return out;
}

/** Merge parsed text into trip settings (does not touch generated plans) */
export function applyParsedToTrip(trip: TripState, parsed: ParsedTripText): TripState {
  let next: TripState = { ...trip };
  if (parsed.destId && parsed.destId !== trip.destId) {
    next = {
      ...next,
      destId: parsed.destId,
      hotel: defaultHotelForDest(parsed.destId),
      customHotels: [],
      arrivalStationId: '',
      departureStationId: '',
    };
  }
  if (parsed.numDays) next.numDays = parsed.numDays;
  if (parsed.startDate) next.startDate = parsed.startDate;
  if (parsed.travelMode) next.travelMode = parsed.travelMode;
  if (parsed.arrivalTime) next.arrivalTime = parsed.arrivalTime;
  if (parsed.departureTime) next.departureTime = parsed.departureTime;
  if (parsed.singleDayEnd) next.singleDayEnd = parsed.singleDayEnd;

  const stations = stationsForDest(next.destId);
  const pickStation = (type?: 'hsr' | 'train') =>
    type
      ? (stations.find((s) => s.anchor_type === type) || stations[0])?.id || ''
      : undefined;
  const arr = pickStation(parsed.arrivalStationType);
  const dep = pickStation(parsed.departureStationType);
  if (arr !== undefined) next.arrivalStationId = arr;
  if (dep !== undefined) next.departureStationId = dep;

  if (parsed.hotelName) {
    const all = [...(CITY_HOTELS[getDest(next.destId).city] || []), ...next.customHotels];
    const short = parsed.hotelName.replace(/[\s（）()]/g, '');
    const known = all.find((h) => {
      const hn = h.name.replace(/^🏨\s*/, '').replace(/[\s（）()]/g, '');
      return hn.includes(short) || short.includes(hn.slice(0, Math.min(4, hn.length)));
    });
    if (known) {
      next.hotel = known;
    } else {
      const dest = getDest(next.destId);
      const custom: TripAnchor = {
        id: `custom-${short}`,
        name: `🏨 ${parsed.hotelName}`,
        anchor_type: 'hotel',
        latitude: dest.latitude,
        longitude: dest.longitude,
        needsGeocode: true,
      };
      next.hotel = custom;
      next.customHotels = [...next.customHotels.filter((h) => h.id !== custom.id), custom];
    }
  }
  return next;
}

export const DEFAULT_TRIP_TEXT =
  '明天 10:30 坐高鐵到台南，住台南大飯店兩晚，第三天下午 4 點半搭高鐵回台北，交通工具是機車';

export function createBaseTrip(destId?: string, travelMode?: TravelMode): TripState {
  const id = destId || PRESET_DESTINATIONS[0].id;
  return {
    destId: id,
    numDays: 1,
    startDate: typeof window !== 'undefined' ? getLocalDateStr(1) : '',
    hotel: defaultHotelForDest(id),
    customHotels: [],
    arrivalStationId: '',
    departureStationId: '',
    arrivalTime: '10:00',
    departureTime: '17:00',
    dailyStart: '09:30',
    dailyEnd: '20:00',
    singleDayEnd: 'none',
    travelMode: travelMode || 'SCOOTER',
    days: [],
    activeDayIndex: 0,
  };
}

/** Build a fresh trip from a full sentence (presets / voice): unspecified fields fall back to defaults */
export function tripFromText(
  text: string,
  fallbackDestId?: string,
  fallbackMode?: TravelMode
): TripState {
  const t = applyParsedToTrip(
    createBaseTrip(fallbackDestId, fallbackMode),
    parseTripFromText(text)
  );
  return { ...t, days: buildTripDays(t) };
}

export function createDefaultTrip(): TripState {
  return tripFromText(DEFAULT_TRIP_TEXT);
}

