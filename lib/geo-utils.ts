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

export const TAIWAN_CITIES = [
  '台北市', '臺北市', '新北市', '桃園市', '台中市', '臺中市',
  '台南市', '臺南市', '高雄市', '基隆市', '新竹市', '新竹縣',
  '苗栗縣', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣',
  '屏東縣', '宜蘭縣', '花蓮縣', '台東縣', '臺東縣', '澎湖縣',
  '金門縣', '連江縣',
];

export const DISTRICT_TO_CITY_MAP: Record<string, string> = {
  // 台南市 (37區)
  新化區: '台南市', 新化: '台南市',
  龍崎區: '台南市', 龍崎: '台南市',
  中西區: '台南市', 安平區: '台南市', 安平: '台南市',
  安南區: '台南市', 永康區: '台南市', 永康: '台南市',
  歸仁區: '台南市', 歸仁: '台南市', 仁德區: '台南市', 仁德: '台南市',
  關廟區: '台南市', 關廟: '台南市', 官田區: '台南市', 官田: '台南市',
  麻豆區: '台南市', 麻豆: '台南市', 佳里區: '台南市', 佳里: '台南市',
  西港區: '台南市', 七股區: '台南市', 將軍區: '台南市',
  學甲區: '台南市', 北門區: '台南市', 新營區: '台南市', 新營: '台南市',
  後壁區: '台南市', 後壁: '台南市', 白河區: '台南市', 白河: '台南市',
  東山區: '台南市', 六甲區: '台南市', 下營區: '台南市',
  柳營區: '台南市', 鹽水區: '台南市', 善化區: '台南市', 善化: '台南市',
  大內區: '台南市', 山上區: '台南市', 玉井區: '台南市', 玉井: '台南市',
  楠西區: '台南市', 南化區: '台南市', 左鎮區: '台南市',

  // 高雄市 (38區)
  鹽埕區: '高雄市', 鹽埕: '高雄市',
  鼓山區: '高雄市', 鼓山: '高雄市',
  左營區: '高雄市', 左營: '高雄市',
  楠梓區: '高雄市', 楠梓: '高雄市',
  三民區: '高雄市', 新興區: '高雄市', 前金區: '高雄市',
  苓雅區: '高雄市', 前鎮區: '高雄市', 旗津區: '高雄市',
  小港區: '高雄市', 鳳山區: '高雄市', 鳳山: '高雄市',
  大寮區: '高雄市', 鳥松區: '高雄市', 仁武區: '高雄市',
  大社區: '高雄市', 岡山區: '高雄市', 岡山: '高雄市',
  路竹區: '高雄市', 阿蓮區: '高雄市', 田寮區: '高雄市',
  燕巢區: '高雄市', 橋頭區: '高雄市', 梓官區: '高雄市',
  彌陀區: '高雄市', 永安區: '高雄市', 湖內區: '高雄市',
  旗山區: '高雄市', 美濃區: '高雄市', 六龜區: '高雄市',
  甲仙區: '高雄市', 杉林區: '高雄市', 內門區: '高雄市',

  // 台北市
  中正區: '台北市', 大同區: '台北市', 中山區: '台北市',
  松山區: '台北市', 大安區: '台北市', 萬華區: '台北市',
  信義區: '台北市', 士林區: '台北市', 北投區: '台北市',
  內湖區: '台北市', 南港區: '台北市', 文山區: '台北市',

  // 新北市
  板橋區: '新北市', 板橋: '新北市', 三重區: '新北市', 三重: '新北市',
  中和區: '新北市', 中和: '新北市', 永和區: '新北市', 永和: '新北市',
  新莊區: '新北市', 新莊: '新北市', 新店區: '新北市', 新店: '新北市',
  樹林區: '新北市', 鶯歌區: '新北市', 三峽區: '新北市',
  淡水區: '新北市', 淡水: '新北市', 汐止區: '新北市', 汐止: '新北市',
  瑞芳區: '新北市', 九份: '新北市',

  // 台中市
  西屯區: '台中市', 西屯: '台中市', 南屯區: '台中市', 南屯: '台中市',
  北屯區: '台中市', 北屯: '台中市', 豐原區: '台中市', 逢甲: '台中市',
  一中街: '台中市',

  // 桃園市
  桃園區: '桃園市', 中壢區: '桃園市', 中壢: '桃園市',
  八德區: '桃園市', 平鎮區: '桃園市', 龜山區: '桃園市',

  // 宜蘭縣
  羅東鎮: '宜蘭縣', 羅東: '宜蘭縣', 礁溪鄉: '宜蘭縣', 礁溪: '宜蘭縣',
  頭城鎮: '宜蘭縣', 蘇澳鎮: '宜蘭縣',

  // 日本熱門區
  台東區: '東京都', 淺草: '東京都', 千代田區: '東京都', 秋葉原: '東京都',
  新宿區: '東京都', 新宿: '東京都', 澀谷區: '東京都', 涉谷: '東京都',
  港區: '東京都', 六本木: '東京都', 中央區: '大阪府', 難波: '大阪府',
  道頓堀: '大阪府', 心齋橋: '大阪府', 京都東山: '京都府', 祇園: '京都府',
  清水寺: '京都府', 中京區: '京都府',
};

const TAIWAN_ADDR_REGEX = new RegExp(
  '(?:(?:台灣|臺灣)\\s*)?' +
  '(?:\\d{3,5}\\s*)?' +
  '(?:' + TAIWAN_CITIES.join('|') + ')' +
  '(?:[^\\d\\s]{1,4}[區市鎮鄉])' +
  '[^\\s+]+?(?:[0-9]+(?:[之\\-]\\d+)?號(?:之\\d+)?(?:[0-9]+[樓Ff])?|[0-9]+號|[0-9]+番地)'
);

const JAPAN_ADDR_REGEX =
  /(?:日本)?(?:東京都|大阪府|京都府|北海道|[^\s,]+?[都道府県])(?:[^\s,都道府県]+?[区區市町村])(?:[^\s,]+?[0-9\-丁目番地号號]+)/;

/**
 * Separate full string (e.g. from Google Maps share text or URL) into clean store name and address
 */
export function separateNameAndAddress(input: string): {
  cleanName: string;
  foundAddress: string;
  detectedCity: string;
  detectedDistrict: string;
  country: string;
} {
  const str = (input || '').replace(/\+/g, ' ').trim();
  let foundAddress = '';
  let detectedCity = '';
  let detectedDistrict = '';
  let country = '台灣';

  // 1. Taiwan Address Match
  const twMatch = str.match(TAIWAN_ADDR_REGEX);
  if (twMatch) {
    foundAddress = twMatch[0].trim();
    country = '台灣';
    const cMatch = foundAddress.match(
      new RegExp('(' + TAIWAN_CITIES.join('|') + ')')
    );
    if (cMatch) {
      detectedCity = cMatch[1].replace('臺', '台');
      const afterCity = foundAddress.slice(cMatch.index! + cMatch[1].length);
      const dMatch = afterCity.match(/^([^\\d\\s,]{1,4}?[區市鎮鄉])/);
      if (dMatch) {
        detectedDistrict = dMatch[1];
      }
    }
  }

  // 2. Japan Address Match
  if (!foundAddress) {
    const jpMatch = str.match(JAPAN_ADDR_REGEX);
    if (jpMatch) {
      foundAddress = jpMatch[0].trim();
      country = '日本';
      const cMatch = foundAddress.match(
        /(東京都|大阪府|京都府|北海道|[^\s,]+?[都道府県])/
      );
      if (cMatch) detectedCity = cMatch[1];
      const dMatch = foundAddress.match(/([^\\s,都道府県]+?[区區市町村])/);
      if (dMatch) detectedDistrict = dMatch[1];
    }
  }

  // 3. Clean store name by stripping the address and boilerplate
  let cleanName = str;
  if (foundAddress) {
    cleanName = cleanName.replace(foundAddress, '');
  }

  cleanName = cleanName
    .replace(/\b\d{3,5}\b/g, '')
    .replace(/^(?:台灣|臺灣)\s*/, '')
    .replace(/^[在於\s]*Google\s*地圖上查看[「『【\s:]*/i, '')
    .replace(/[「『【」』】:：]/g, '')
    .replace(/[0-9.]+\s*★[^\s]*/g, '')
    .replace(/\([0-9,]+\)/g, '')
    .replace(/https?:\/\/[^\s)]+/gi, '')
    .replace(/·|-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // If cleanName is empty (e.g. input was only an address), fallback to something readable
  if (!cleanName && foundAddress) {
    cleanName = foundAddress;
  }

  return {
    cleanName,
    foundAddress,
    detectedCity,
    detectedDistrict,
    country,
  };
}

/**
 * Automatically extract country, city, and district from an address or text
 */
export function extractRegionFromAddress(
  address: string,
  coords?: { lat: number; lng: number } | null,
  fallbackCity = '台南市'
): {
  country: string;
  city: string;
  district: string;
} {
  const clean = (address || '').trim();

  // 1. Japan detection
  if (
    clean.includes('日本') ||
    clean.includes('東京都') ||
    clean.includes('大阪府') ||
    clean.includes('京都府') ||
    clean.includes('Tokyo') ||
    clean.includes('Japan')
  ) {
    const cityMatch = clean.match(
      /(東京都|大阪府|京都府|北海道|[^\s,]+?[都道府県])/
    );
    const distMatch = clean.match(/([^\\s,都道府県]+?[区區市町村])/);
    return {
      country: '日本',
      city: cityMatch ? cityMatch[1] : '東京都',
      district: distMatch ? distMatch[1] : '台東區',
    };
  }

  // 2. Explicit Taiwan City detection
  const twCityMatch = clean.match(
    /(台北市|臺北市|新北市|桃園市|台中市|臺中市|台南市|臺南市|高雄市|基隆市|新竹市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|屏東縣|宜蘭縣|花蓮縣|台東縣|臺東縣|澎湖縣|金門縣)/
  );

  let cityRaw = twCityMatch ? twCityMatch[1].replace('臺', '台') : '';
  let district = '';

  if (twCityMatch) {
    const afterCity = clean.slice(
      clean.indexOf(twCityMatch[1]) + twCityMatch[1].length
    );
    const distMatch = afterCity.match(/^([^\\d\\s,]{1,4}?[區市鎮鄉])/);
    if (distMatch) {
      district = distMatch[1];
    }
  }

  // 3. If city not found explicitly, match from known districts (e.g. 新化區 -> 台南市)
  if (!cityRaw) {
    for (const [distKey, mappedCity] of Object.entries(DISTRICT_TO_CITY_MAP)) {
      if (clean.includes(distKey)) {
        cityRaw = mappedCity;
        district = distKey.endsWith('區') || distKey.endsWith('鎮') || distKey.endsWith('鄉')
          ? distKey
          : `${distKey}區`;
        break;
      }
    }
  }

  // 4. If still no city, verify coordinates if available
  if (!cityRaw && coords) {
    const { lat, lng } = coords;
    if (lat >= 22.88 && lat <= 23.42 && lng >= 120.0 && lng <= 120.65) {
      cityRaw = '台南市';
    } else if (lat >= 22.45 && lat <= 22.88 && lng >= 120.15 && lng <= 120.8) {
      cityRaw = '高雄市';
    } else if (lat >= 24.95 && lat <= 25.3 && lng >= 121.4 && lng <= 121.7) {
      cityRaw = '台北市';
    } else if (lat >= 24.05 && lat <= 24.45 && lng >= 120.45 && lng <= 120.9) {
      cityRaw = '台中市';
    } else if (lat >= 35.5 && lat <= 35.85 && lng >= 139.5 && lng <= 140.0) {
      return { country: '日本', city: '東京都', district: district || '台東區' };
    }
  }

  // 5. Final fallback
  if (!cityRaw) {
    cityRaw = fallbackCity || '台南市';
  }

  if (!district) {
    const genericDist = clean.match(/([^\\d\\s,]{2,3}[區鎮鄉])/);
    district = genericDist ? genericDist[1] : '市中心';
  }

  return {
    country: '台灣',
    city: cityRaw,
    district,
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
