import { OpeningHoursJson, SavedPlace, TravelMode } from '@/types/place';

/**
 * Calculate Haversine distance in meters between two coordinates
 */
export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Estimate realistic travel time in minutes from straight-line distance & mode
 */
export function estimateTravelMins(
  distanceMeters: number,
  mode: TravelMode
): number {
  const roadDistance = distanceMeters * 1.28; // detour factor
  if (mode === 'WALK') {
    // ~75 meters/min
    return Math.max(2, Math.round(roadDistance / 75));
  }
  if (mode === 'SCOOTER') {
    // ~380 meters/min in urban streets + 2 min scooter parking buffer
    return Math.max(3, Math.round(roadDistance / 380) + 2);
  }
  if (mode === 'TRANSIT') {
    // wait + transit ~260 meters/min
    return Math.max(5, Math.round(roadDistance / 260) + 4);
  }
  // DRIVE: ~420 meters/min in urban areas + 5 min car parking buffer
  return Math.max(5, Math.round(roadDistance / 420) + 5);
}

/**
 * Format "HH:MM" plus delta minutes into "HH:MM"
 */
export function addMinutesToTime(timeStr: string, minutesToAdd: number): string {
  const [hh, mm] = timeStr.split(':').map((n) => parseInt(n, 10) || 0);
  const totalMins = (hh * 60 + mm + minutesToAdd + 24 * 60) % (24 * 60);
  const nextH = String(Math.floor(totalMins / 60)).padStart(2, '0');
  const nextM = String(totalMins % 60).padStart(2, '0');
  return `${nextH}:${nextM}`;
}

/**
 * Check if a place is open at a given "HH:MM" time
 */
export function checkPlaceOpenAtTime(
  openingHours: OpeningHoursJson | null,
  businessStatus: string,
  arrivalTimeStr: string
): { isOpen: boolean; note: string } {
  if (businessStatus === 'CLOSED_PERMANENTLY') {
    return { isOpen: false, note: '已永久歇業' };
  }
  if (businessStatus === 'CLOSED_TEMPORARILY') {
    return { isOpen: false, note: '今日臨時公休' };
  }
  if (!openingHours?.daily_hours) {
    return { isOpen: true, note: '營業中（全天或依現場公告）' };
  }

  const { open, close } = openingHours.daily_hours;
  const toMins = (t: string) => {
    const [h, m] = t.split(':').map((v) => parseInt(v, 10) || 0);
    return h * 60 + m;
  };
  const arr = toMins(arrivalTimeStr);
  const op = toMins(open);
  let cl = toMins(close);
  if (cl <= op) cl += 24 * 60; // overnight hours

  const normalizedArr = arr < op && cl > 24 * 60 ? arr + 24 * 60 : arr;
  const isOpen = normalizedArr >= op && normalizedArr <= cl - 15;
  if (isOpen) {
    return { isOpen: true, note: `營業中 (${open}–${close})` };
  }
  return {
    isOpen: false,
    note: `預計抵達 ${arrivalTimeStr} 時未營業 (營業時間 ${open}–${close})`,
  };
}

/**
 * Automatically extract country, city, and district from a formatted address
 */
export function extractRegionFromAddress(address: string): {
  country: string;
  city: string;
  district: string;
} {
  const clean = (address || '').trim();
  if (!clean) {
    return { country: '台灣', city: '高雄市', district: '鹽埕區' };
  }

  // Japan detection
  if (
    clean.includes('日本') ||
    clean.includes('東京都') ||
    clean.includes('大阪府') ||
    clean.includes('京都府') ||
    clean.includes('Tokyo') ||
    clean.includes('Japan')
  ) {
    const cityMatch = clean.match(/(東京都|大阪府|京都府|北海道|[^\s,]+?[都道府県])/);
    const distMatch = clean.match(/([^\s,都道府県]+?[区市町村])/);
    return {
      country: '日本',
      city: cityMatch ? cityMatch[1] : '東京都',
      district: distMatch ? distMatch[1] : '台東區',
    };
  }

  // Taiwan detection
  const twCityMatch = clean.match(
    /(台北市|臺北市|新北市|桃園市|台中市|臺中市|台南市|臺南市|高雄市|基隆市|新竹市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|屏東縣|宜蘭縣|花蓮縣|台東縣|臺東縣|澎湖縣|金門縣)/
  );
  const cityRaw = twCityMatch ? twCityMatch[1].replace('臺', '台') : '高雄市';

  // Extract district after city
  let district = '';
  if (twCityMatch) {
    const afterCity = clean.slice(
      clean.indexOf(twCityMatch[1]) + twCityMatch[1].length
    );
    const distMatch = afterCity.match(/^([^\d\s,]{1,4}?[區市鎮鄉])/);
    if (distMatch) {
      district = distMatch[1];
    }
  } else {
    const genericDist = clean.match(/([^\d\s,]{2,3}[區鎮鄉])/);
    if (genericDist) district = genericDist[1];
  }

  return {
    country: '台灣',
    city: cityRaw,
    district: district || '市中心',
  };
}

/**
 * Build Google Maps multi-stop navigation URL
 */
export function buildGoogleMapsDirUrl(
  origin: { latitude: number; longitude: number },
  stops: SavedPlace[],
  mode: TravelMode,
  endAnchor?: { latitude: number; longitude: number } | null
): string {
  if (stops.length === 0) return 'https://www.google.com/maps';
  const finalDest = endAnchor || stops[stops.length - 1];
  const waypointStops = endAnchor ? stops : stops.slice(0, -1);
  const waypoints = waypointStops
    .map((s) => `${s.latitude},${s.longitude}`)
    .join('|');
  const travelmode =
    mode === 'WALK'
      ? 'walking'
      : mode === 'TRANSIT'
      ? 'transit'
      : 'driving';

  const params = new URLSearchParams({
    api: '1',
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${finalDest.latitude},${finalDest.longitude}`,
    travelmode,
  });
  if (waypoints) {
    params.set('waypoints', waypoints);
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
