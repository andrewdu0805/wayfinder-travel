import { OpeningHoursJson, OpeningPeriodRange } from '@/types/place';

export const WEEKDAY_LABELS = [
  '週日',
  '週一',
  '週二',
  '週三',
  '週四',
  '週五',
  '週六',
] as const;

/** Display order Mon -> Sun */
export const WEEKDAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const CN_DAY_CHAR_TO_NUM: Record<string, number> = {
  日: 0,
  天: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
};

const EN_DAY_TO_NUM: Array<[RegExp, number]> = [
  [/^sunday\b/i, 0],
  [/^monday\b/i, 1],
  [/^tuesday\b/i, 2],
  [/^wednesday\b/i, 3],
  [/^thursday\b/i, 4],
  [/^friday\b/i, 5],
  [/^saturday\b/i, 6],
];

function pad2(n: number): string {
  return String(Math.max(0, Math.min(23, n))).padStart(2, '0');
}

function normalizeTimeStr(rawHour: number, rawMin: number, ampm?: string): string {
  let h = rawHour;
  if (ampm) {
    const a = ampm.toLowerCase();
    if (a === 'pm' && h < 12) h += 12;
    if (a === 'am' && h === 12) h = 0;
  }
  return `${pad2(h)}:${String(Math.max(0, Math.min(59, rawMin))).padStart(2, '0')}`;
}

/**
 * Extract all time ranges (e.g. "11:00–14:30, 17:30–21:00" or "11:00 AM – 9:00 PM") from a string.
 */
export function extractRangesFromText(text: string): OpeningPeriodRange[] {
  if (!text) return [];
  if (/24\s*小時|全天開放|open\s*24\s*hours/i.test(text)) {
    return [{ open: '00:00', close: '23:59' }];
  }

  const ranges: OpeningPeriodRange[] = [];
  const regex =
    /(\d{1,2}):(\d{2})(?:\s*(AM|PM))?\s*[–—\-~～至到]\s*(\d{1,2}):(\d{2})(?:\s*(AM|PM))?/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const open = normalizeTimeStr(parseInt(m[1], 10), parseInt(m[2], 10), m[3]);
    const close = normalizeTimeStr(parseInt(m[4], 10), parseInt(m[5], 10), m[6]);
    ranges.push({ open, close });
  }
  return ranges;
}

/**
 * Parse a single Google Maps weekday_description line (e.g. "星期一: 休息" or "Tuesday: 11:00 AM – 9:00 PM")
 */
function parseSingleWeekdayLine(
  line: string
): { day: number; ranges: OpeningPeriodRange[] } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let day: number | null = null;
  let rest = '';

  const cnMatch = trimmed.match(/^(?:星期|週|周|禮拜)([日天一二三四五六])\s*[:：]\s*(.*)$/);
  if (cnMatch) {
    day = CN_DAY_CHAR_TO_NUM[cnMatch[1]] ?? null;
    rest = cnMatch[2] || '';
  } else {
    for (const [re, num] of EN_DAY_TO_NUM) {
      if (re.test(trimmed)) {
        day = num;
        rest = trimmed.replace(/^[a-z]+\s*[:：]\s*/i, '');
        break;
      }
    }
  }

  if (day === null) return null;
  if (/休息|公休|休館|未營業|closed/i.test(rest)) {
    return { day, ranges: [] };
  }
  const ranges = extractRangesFromText(rest);
  return { day, ranges };
}

/**
 * Parse shorthand Chinese weekday descriptions such as:
 * - "10:00–20:20 (週二公休)"
 * - "週二至週日 09:00–17:00"
 * - "週一至週日 11:00–19:00（每週二公休）"
 * - "10:00–18:00 (週一、週二休館)"
 */
function parseShorthandChineseSchedule(
  text: string,
  fallbackRanges: OpeningPeriodRange[]
): Record<number, OpeningPeriodRange[]> | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const ranges = extractRangesFromText(trimmed);
  const effectiveRanges = ranges.length > 0 ? ranges : fallbackRanges;
  if (effectiveRanges.length === 0) return null;

  const schedule: Record<number, OpeningPeriodRange[]> = {
    0: [...effectiveRanges],
    1: [...effectiveRanges],
    2: [...effectiveRanges],
    3: [...effectiveRanges],
    4: [...effectiveRanges],
    5: [...effectiveRanges],
    6: [...effectiveRanges],
  };

  let matchedAnyDayRule = false;

  // 1. Check explicit open range like "週二至週日" / "星期二到星期六"
  const openRangeMatch = trimmed.match(
    /(?:星期|週|周|禮拜)([日天一二三四五六])\s*[至到~～\-–]\s*(?:星期|週|周|禮拜)?([日天一二三四五六])/
  );
  if (openRangeMatch) {
    const startDay = CN_DAY_CHAR_TO_NUM[openRangeMatch[1]];
    const endDay = CN_DAY_CHAR_TO_NUM[openRangeMatch[2]];
    if (startDay !== undefined && endDay !== undefined) {
      const openDays = new Set<number>();
      let cur = startDay;
      for (let step = 0; step < 7; step++) {
        openDays.add(cur);
        if (cur === endDay) break;
        cur = (cur + 1) % 7;
      }
      for (let d = 0; d < 7; d++) {
        if (!openDays.has(d)) {
          schedule[d] = [];
        }
      }
      matchedAnyDayRule = true;
    }
  }

  // 2. Check explicit closed days like "週一公休", "週一、週二休館", "每週二休息", "週三四公休"
  const closedMatches = trimmed.matchAll(
    /(?:每)?(?:星期|週|周|禮拜)([日天一二三四五六](?:[、,，與及和\/]?(?:星期|週|周|禮拜)?[日天一二三四五六])*)\s*(?:公休|休館|休息|店休|不營業)/g
  );
  for (const m of closedMatches) {
    const daysPart = m[1] || '';
    for (const ch of daysPart) {
      const d = CN_DAY_CHAR_TO_NUM[ch];
      if (d !== undefined) {
        schedule[d] = [];
        matchedAnyDayRule = true;
      }
    }
  }

  if (/每日|每天|全年無休/.test(trimmed)) {
    matchedAnyDayRule = true;
  }

  return matchedAnyDayRule || ranges.length > 0 ? schedule : null;
}

/**
 * Resolve a full 7-day schedule (keys 0..6, 0=Sun..6=Sat) from OpeningHoursJson.
 * Priority:
 * 1. openingHours.by_weekday (exact structured data saved in Supabase)
 * 2. openingHours.weekday_descriptions (Google 7-day list OR shorthand Chinese)
 * 3. openingHours.daily_hours (respecting closed_days if present)
 */
export function parseWeekdaySchedule(
  openingHours: OpeningHoursJson | null | undefined
): Record<number, OpeningPeriodRange[]> | null {
  if (!openingHours) return null;

  // 1. Structured by_weekday map
  if (
    openingHours.by_weekday &&
    typeof openingHours.by_weekday === 'object' &&
    Object.keys(openingHours.by_weekday).length > 0
  ) {
    const result: Record<number, OpeningPeriodRange[]> = {};
    let hasAny = false;
    for (let d = 0; d < 7; d++) {
      const arr = openingHours.by_weekday[String(d)];
      if (Array.isArray(arr)) {
        result[d] = arr.filter((r) => r && r.open && r.close);
        hasAny = true;
      }
    }
    if (hasAny) return result;
  }

  const fallbackDaily: OpeningPeriodRange[] = openingHours.daily_hours?.open
    ? [
        {
          open: openingHours.daily_hours.open,
          close: openingHours.daily_hours.close,
        },
      ]
    : [];

  // 2. Google 7-day weekday_descriptions
  const descs = Array.isArray(openingHours.weekday_descriptions)
    ? openingHours.weekday_descriptions.filter(Boolean)
    : [];

  if (descs.length > 0) {
    const parsedLines: Record<number, OpeningPeriodRange[]> = {};
    let parsedCount = 0;
    for (const line of descs) {
      const parsed = parseSingleWeekdayLine(line);
      if (parsed) {
        parsedLines[parsed.day] = parsed.ranges;
        parsedCount += 1;
      }
    }
    if (parsedCount >= 3) {
      return parsedLines;
    }

    // Try shorthand Chinese format (e.g. "10:00–20:20 (週二公休)")
    const joined = descs.join(' ');
    const shorthand = parseShorthandChineseSchedule(joined, fallbackDaily);
    if (shorthand) return shorthand;
  }

  // 3. Fallback to daily_hours
  if (fallbackDaily.length > 0) {
    const closedSet = new Set(openingHours.daily_hours?.closed_days || []);
    const result: Record<number, OpeningPeriodRange[]> = {};
    for (let d = 0; d < 7; d++) {
      result[d] = closedSet.has(d) ? [] : [...fallbackDaily];
    }
    return result;
  }

  return null;
}

/**
 * Format a day's opening ranges into concise Traditional Chinese text.
 */
export function formatRangesText(ranges: OpeningPeriodRange[]): string {
  if (ranges.length === 0) return '公休';
  if (
    ranges.length === 1 &&
    ranges[0].open === '00:00' &&
    ranges[0].close === '23:59'
  ) {
    return '24 小時營業';
  }
  return ranges.map((r) => `${r.open}–${r.close}`).join(', ');
}

/**
 * Build a complete OpeningHoursJson with `by_weekday`, `daily_hours.closed_days`, and `weekday_descriptions`
 * so all 7 days are persisted cleanly in Supabase `opening_hours_json` JSONB.
 */
export function normalizeOpeningHoursForStorage(
  openingHours: OpeningHoursJson | null | undefined
): OpeningHoursJson | null {
  if (!openingHours) return null;
  const schedule = parseWeekdaySchedule(openingHours);
  if (!schedule) return openingHours;

  const byWeekday: Record<string, OpeningPeriodRange[]> = {};
  const closedDays: number[] = [];
  let firstOpenRange: OpeningPeriodRange | null = null;

  for (let d = 0; d < 7; d++) {
    const ranges = schedule[d] ?? [];
    byWeekday[String(d)] = ranges;
    if (ranges.length === 0) {
      closedDays.push(d);
    } else if (!firstOpenRange) {
      firstOpenRange = ranges[0];
    }
  }

  const existingDescs = Array.isArray(openingHours.weekday_descriptions)
    ? openingHours.weekday_descriptions.filter(Boolean)
    : [];

  // Keep Google's official 7-line weekday_descriptions if present; otherwise generate standard 7-day lines
  const weekdayDescriptions =
    existingDescs.length >= 7
      ? existingDescs
      : WEEKDAY_DISPLAY_ORDER.map(
          (d) => `${WEEKDAY_LABELS[d]}: ${formatRangesText(byWeekday[String(d)])}`
        );

  return {
    ...openingHours,
    weekday_descriptions: weekdayDescriptions,
    daily_hours: {
      open:
        openingHours.daily_hours?.open || firstOpenRange?.open || '10:00',
      close:
        openingHours.daily_hours?.close || firstOpenRange?.close || '21:00',
      closed_days: closedDays,
    },
    by_weekday: byWeekday,
  };
}

/**
 * Returns true if the place is explicitly closed ALL DAY on the given dayOfWeek (0=Sun..6=Sat).
 */
export function isPlaceClosedAllDay(
  openingHours: OpeningHoursJson | null | undefined,
  dayOfWeek: number
): boolean {
  const schedule = parseWeekdaySchedule(openingHours);
  if (!schedule) return false;
  const ranges = schedule[dayOfWeek];
  return Array.isArray(ranges) && ranges.length === 0;
}

export interface WeekdayHoursSummary {
  dayOfWeek: number;
  dayLabel: string;
  isClosed: boolean;
  text: string;
  hasStructuredSchedule: boolean;
  fullWeek: Array<{
    day: number;
    label: string;
    isClosed: boolean;
    text: string;
  }>;
}

/**
 * Get the opening hours summary for a specific weekday (defaults to today's weekday),
 * plus the full 7-day breakdown (Mon..Sun) for expandable UI.
 */
export function getWeekdayHoursSummary(
  openingHours: OpeningHoursJson | null | undefined,
  dayOfWeek?: number | null
): WeekdayHoursSummary {
  const schedule = parseWeekdaySchedule(openingHours);

  if (dayOfWeek === null || dayOfWeek === undefined || !Number.isFinite(dayOfWeek)) {
    const fullWeek = schedule
      ? WEEKDAY_DISPLAY_ORDER.map((d) => {
          const ranges = schedule[d] ?? [];
          return {
            day: d,
            label: WEEKDAY_LABELS[d],
            isClosed: ranges.length === 0,
            text: formatRangesText(ranges),
          };
        })
      : [];
    const firstOpen = fullWeek.find((r) => !r.isClosed);
    const fallbackText =
      (firstOpen ? `${firstOpen.label} ${firstOpen.text}` : null) ||
      openingHours?.weekday_descriptions?.[0] ||
      '營業時間依現場公告';
    return {
      dayOfWeek: -1,
      dayLabel: '',
      isClosed: false,
      text: fallbackText,
      hasStructuredSchedule: Boolean(schedule),
      fullWeek,
    };
  }

  const safeDay = ((dayOfWeek % 7) + 7) % 7;
  const dayLabel = WEEKDAY_LABELS[safeDay];

  if (!schedule) {
    const fallbackText =
      openingHours?.weekday_descriptions?.[0] || '營業時間依現場公告';
    return {
      dayOfWeek: safeDay,
      dayLabel,
      isClosed: false,
      text: fallbackText,
      hasStructuredSchedule: false,
      fullWeek: [],
    };
  }

  const todayRanges = schedule[safeDay];
  const isClosed = Array.isArray(todayRanges) && todayRanges.length === 0;
  const todayText = isClosed
    ? `${dayLabel}公休`
    : todayRanges
    ? `${dayLabel} ${formatRangesText(todayRanges)}`
    : '營業時間依現場公告';

  const fullWeek = WEEKDAY_DISPLAY_ORDER.map((d) => {
    const ranges = schedule[d] ?? [];
    return {
      day: d,
      label: WEEKDAY_LABELS[d],
      isClosed: ranges.length === 0,
      text: formatRangesText(ranges),
    };
  });

  return {
    dayOfWeek: safeDay,
    dayLabel,
    isClosed,
    text: todayText,
    hasStructuredSchedule: true,
    fullWeek,
  };
}
