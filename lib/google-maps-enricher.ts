import { GoogleGenAI } from '@google/genai';
import {
  BusinessStatus,
  CategoryConfig,
  SavedPlace,
} from '@/types/place';
import {
  calculateDistanceMeters,
  cleanStoreName,
  extractCoordsFromGoogleMapsUrl,
  extractPlaceNameFromGoogleMapsUrl,
  extractRegionFromAddress,
  inferPlaceCategoryByName,
  separateNameAndAddress,
} from '@/lib/geo-utils';
import { resolvePlaceDescription } from '@/lib/place-notes';

export interface EnrichOptions {
  googleMapsApiKey?: string;
  geminiApiKey?: string;
  categoryConfigs: CategoryConfig[];
  hasUserCustomNote?: boolean;
}

interface GoogleOpeningPeriod {
  open?: { day?: number; hour?: number; minute?: number };
  close?: { day?: number; hour?: number; minute?: number };
}

interface GoogleOpeningHours {
  openNow?: boolean;
  weekdayDescriptions?: string[];
  periods?: GoogleOpeningPeriod[];
}

function pad2(n: number): string {
  return String(Math.max(0, Math.min(23, n))).padStart(2, '0');
}

function padMin(n: number): string {
  return String(Math.max(0, Math.min(59, n))).padStart(2, '0');
}

import {
  formatRangesText,
  normalizeOpeningHoursForStorage,
  WEEKDAY_DISPLAY_ORDER,
  WEEKDAY_LABELS,
} from '@/lib/opening-hours';
import { OpeningPeriodRange } from '@/types/place';

/**
 * Parse Google Places API (New) regularOpeningHours into app opening_hours_json
 * preserving all 7 days in `by_weekday`, `daily_hours.closed_days`, and `weekday_descriptions`.
 */
export function parseGoogleOpeningHours(
  hours?: GoogleOpeningHours
): SavedPlace['opening_hours_json'] | null {
  if (!hours) return null;
  const weekdayDescriptions = Array.isArray(hours.weekdayDescriptions)
    ? hours.weekdayDescriptions.filter(Boolean)
    : [];

  let openStr = '';
  let closeStr = '';
  const byWeekday: Record<string, OpeningPeriodRange[]> = {};
  let builtByWeekdayFromPeriods = false;

  // 1. Parse structured periods into per-weekday ranges ("0"=Sun .. "6"=Sat)
  if (Array.isArray(hours.periods) && hours.periods.length > 0) {
    // Check 24h place (single period with day 0, hour 0, min 0 and no close)
    if (
      hours.periods.length === 1 &&
      hours.periods[0].open?.hour === 0 &&
      !hours.periods[0].close
    ) {
      openStr = '00:00';
      closeStr = '23:59';
      for (let d = 0; d < 7; d++) {
        byWeekday[String(d)] = [{ open: '00:00', close: '23:59' }];
      }
      builtByWeekdayFromPeriods = true;
    } else {
      for (let d = 0; d < 7; d++) {
        byWeekday[String(d)] = [];
      }
      for (const p of hours.periods) {
        if (
          typeof p.open?.day === 'number' &&
          typeof p.open?.hour === 'number' &&
          typeof p.close?.hour === 'number'
        ) {
          const dayKey = String(((p.open.day % 7) + 7) % 7);
          const open = `${pad2(p.open.hour)}:${padMin(p.open.minute ?? 0)}`;
          const close = `${pad2(p.close.hour)}:${padMin(p.close.minute ?? 0)}`;
          byWeekday[dayKey].push({ open, close });
          if (!openStr) {
            openStr = open;
            closeStr = close;
          }
          builtByWeekdayFromPeriods = true;
        }
      }
    }
  }

  // 2. Fallback: parse HH:MM–HH:MM from weekdayDescriptions text
  if ((!openStr || !closeStr) && weekdayDescriptions.length > 0) {
    for (const desc of weekdayDescriptions) {
      if (/24\s*小時營業|Open 24 hours/i.test(desc)) {
        openStr = '00:00';
        closeStr = '23:59';
        break;
      }
      const m = desc.match(
        /(\d{1,2}):(\d{2})\s*[–\-~至到]\s*(\d{1,2}):(\d{2})/
      );
      if (m) {
        openStr = `${pad2(parseInt(m[1], 10))}:${m[2]}`;
        closeStr = `${pad2(parseInt(m[3], 10))}:${m[4]}`;
        break;
      }
    }
  }

  if (weekdayDescriptions.length === 0 && !openStr && !builtByWeekdayFromPeriods) {
    return null;
  }

  const closedDays = builtByWeekdayFromPeriods
    ? [0, 1, 2, 3, 4, 5, 6].filter((d) => byWeekday[String(d)].length === 0)
    : undefined;

  const base: SavedPlace['opening_hours_json'] = {
    open_now: hours.openNow ?? true,
    weekday_descriptions:
      weekdayDescriptions.length > 0
        ? weekdayDescriptions
        : builtByWeekdayFromPeriods
        ? WEEKDAY_DISPLAY_ORDER.map(
            (d) =>
              `${WEEKDAY_LABELS[d]}: ${formatRangesText(byWeekday[String(d)])}`
          )
        : [`每日 ${openStr}–${closeStr}`],
    daily_hours:
      openStr && closeStr
        ? { open: openStr, close: closeStr, ...(closedDays ? { closed_days: closedDays } : {}) }
        : { open: '10:00', close: '21:00', ...(closedDays ? { closed_days: closedDays } : {}) },
    ...(builtByWeekdayFromPeriods ? { by_weekday: byWeekday } : {}),
  };

  return normalizeOpeningHoursForStorage(base);
}

/**
 * Map official Google Maps category (Places API types + primaryType + localized Chinese label)
 * to our app's primary_category & sub_category.
 */
export function mapGoogleCategoryToAppCategory(
  primaryType: string | undefined,
  types: string[] | undefined,
  chineseLabel: string | undefined,
  placeName: string,
  categoryConfigs: CategoryConfig[]
): {
  primary_category: string;
  sub_category: string;
  estimated_stay_mins: number;
} | null {
  const allTypes = new Set<string>(
    [primaryType, ...(types || [])]
      .filter(Boolean)
      .map((t) => String(t).toLowerCase())
  );
  const label = (chineseLabel || '').trim();
  const nameLower = (placeName || '').toLowerCase();

  let sub: string | null = null;
  let primary: string | null = null;

  // 1. Check Google Places API structured types first
  const barTypes = [
    'bar',
    'pub',
    'wine_bar',
    'cocktail_bar',
    'night_club',
    'brewery',
    'beer_garden',
    'bar_and_grill',
    'gastropub',
    'izakaya_restaurant',
  ];
  const museumTypes = [
    'museum',
    'art_gallery',
    'performing_arts_theater',
    'concert_hall',
    'cultural_center',
    'auditorium',
    'planetarium',
    'aquarium',
    'library',
  ];
  const landmarkTypes = [
    'historical_landmark',
    'cultural_landmark',
    'monument',
    'castle',
    'church',
    'hindu_temple',
    'buddhist_temple',
    'shinto_shrine',
    'place_of_worship',
    'historical_place',
    'plaza',
    'observation_deck',
    'marina',
    'pier',
    'harbor',
  ];
  const shoppingMarketTypes = [
    'market',
    'farmers_market',
    'night_market',
    'shopping_mall',
    'department_store',
    'book_store',
    'store',
    'supermarket',
  ];
  const trailTypes = [
    'hiking_area',
    'national_park',
    'state_park',
    'park',
    'natural_feature',
    'beach',
    'campground',
    'botanical_garden',
    'wildlife_park',
    'scenic_spot',
    'garden',
    'farm',
  ];
  const souvenirTypes = ['gift_shop', 'souvenir_store'];
  const snackDessertTypes = [
    'cafe',
    'coffee_shop',
    'bakery',
    'dessert_shop',
    'ice_cream_shop',
    'tea_house',
    'juice_shop',
    'bubble_tea_store',
    'donut_shop',
    'pastry_shop',
    'bagel_shop',
    'cat_cafe',
    'dessert_restaurant',
  ];

  const pt = (primaryType || '').toLowerCase();

  // Primary type takes highest precedence
  if (barTypes.includes(pt)) {
    primary = 'restaurant';
    sub = 'bar';
  } else if (museumTypes.includes(pt)) {
    primary = 'museum_culture';
    sub = 'museum';
  } else if (landmarkTypes.includes(pt)) {
    primary = 'museum_culture';
    sub = 'landmark';
  } else if (trailTypes.includes(pt)) {
    primary = 'nature_outdoor';
    sub = 'trail';
  } else if (souvenirTypes.includes(pt)) {
    primary = 'restaurant';
    sub = 'souvenir';
  } else if (shoppingMarketTypes.includes(pt)) {
    primary = 'shopping';
    sub = 'other';
  } else if (snackDessertTypes.includes(pt)) {
    primary = 'restaurant';
    sub = 'snack_dessert';
  } else if (
    pt.includes('restaurant') ||
    pt === 'meal_takeaway' ||
    pt === 'food_court' ||
    pt === 'diner' ||
    pt === 'steak_house' ||
    pt === 'noodle_shop'
  ) {
    // Bistro / craft beer bar listed as Italian/American restaurant on Google Maps
    if (
      allTypes.has('bar') ||
      allTypes.has('pub') ||
      allTypes.has('wine_bar') ||
      /餐酒館|酒吧|精釀|bistro|\bbar\b|啤酒/.test(nameLower)
    ) {
      primary = 'restaurant';
      sub = 'bar';
    } else {
      primary = 'restaurant';
      sub = 'meal';
    }
  } else if (pt === 'tourist_attraction' || pt === 'point_of_interest') {
    if (
      museumTypes.some((t) => allTypes.has(t)) ||
      /館|中心|園區|工場|工廠|劇院|博/.test(nameLower)
    ) {
      primary = 'museum_culture';
      sub = 'museum';
    } else if (trailTypes.some((t) => allTypes.has(t))) {
      primary = 'nature_outdoor';
      sub = 'trail';
    } else {
      primary = 'museum_culture';
      sub = 'landmark';
    }
  }

  // 2. Check Chinese Google Maps category label (e.g. from og:description or primaryTypeDisplayName)
  if (!sub && label) {
    if (/酒吧|餐酒館|精釀啤酒|居酒屋|夜店|酒館|葡萄酒吧|清酒吧|小酒館/.test(label)) {
      primary = 'restaurant';
      sub = 'bar';
    } else if (
      /博物館|美術館|藝術中心|文化中心|表演藝術|音樂廳|劇院|戲院|展覽館|故事館|科學館|圖書館|藝廊|觀光工廠|文創館|展示館/.test(
        label
      )
    ) {
      primary = 'museum_culture';
      sub = 'museum';
    } else if (
      /歷史地標|古蹟|旅遊景點|觀光景點|廟宇|寺廟|教堂|書院|老街|紀念碑|城堡|砲台|燈塔|歷史建築|地標|漁港|碼頭|港灣|漁村|景點/.test(
        label
      )
    ) {
      primary = 'museum_culture';
      sub = 'landmark';
    } else if (
      /夜市|市集|市場|魚市|商圈|購物中心|百貨|商場|書店|選物/.test(label)
    ) {
      primary = 'shopping';
      sub = 'other';
    } else if (
      /公園|國家公園|登山步道|步道|海灘|風景區|自然|植物園|農場|牧場|觀景台|濕地/.test(
        label
      )
    ) {
      primary = 'nature_outdoor';
      sub = 'trail';
    } else if (/伴手禮|禮品店|紀念品|糕餅店|名產/.test(label)) {
      primary = 'restaurant';
      sub = 'souvenir';
    } else if (
      /咖啡廳|咖啡館|咖啡店|甜點店|冰品店|冰淇淋店|烘焙坊|麵包店|蛋糕店|茶館|茶藝館|飲料店|豆花|甜品|點心/.test(
        label
      )
    ) {
      primary = 'restaurant';
      sub = 'snack_dessert';
    } else if (
      /餐廳|飯店|料理|麵店|牛肉麵|火鍋|燒肉|牛排|早午餐|早餐店|熱炒|海鮮|食堂|小館|小吃|快餐|義大利|意大利|美式|日式|中式|泰式|韓式|法式|台菜|烤雞|燒臘/.test(
        label
      )
    ) {
      if (/餐酒館|酒吧|精釀|bistro|\bbar\b|啤酒/.test(nameLower)) {
        primary = 'restaurant';
        sub = 'bar';
      } else {
        primary = 'restaurant';
        sub = 'meal';
      }
    }
  }

  // 3. Secondary check against allTypes array
  if (!sub && allTypes.size > 0) {
    if (barTypes.some((t) => allTypes.has(t))) {
      primary = 'restaurant';
      sub = 'bar';
    } else if (museumTypes.some((t) => allTypes.has(t))) {
      primary = 'museum_culture';
      sub = 'museum';
    } else if (landmarkTypes.some((t) => allTypes.has(t))) {
      primary = 'museum_culture';
      sub = 'landmark';
    } else if (trailTypes.some((t) => allTypes.has(t))) {
      primary = 'nature_outdoor';
      sub = 'trail';
    } else if (souvenirTypes.some((t) => allTypes.has(t))) {
      primary = 'restaurant';
      sub = 'souvenir';
    } else if (shoppingMarketTypes.some((t) => allTypes.has(t))) {
      primary = 'shopping';
      sub = 'other';
    } else if (snackDessertTypes.some((t) => allTypes.has(t))) {
      primary = 'restaurant';
      sub = 'snack_dessert';
    } else if (allTypes.has('tourist_attraction')) {
      primary = 'museum_culture';
      sub = 'landmark';
    } else if (allTypes.has('restaurant') || allTypes.has('food')) {
      primary = 'restaurant';
      sub = 'meal';
    }
  }

  if (!primary || !sub) return null;

  const cfg = categoryConfigs.find((c) => c.sub_category === sub);
  return {
    primary_category: primary,
    sub_category: sub,
    estimated_stay_mins:
      cfg?.default_stay_mins ??
      (sub === 'museum'
        ? 100
        : sub === 'bar'
        ? 90
        : sub === 'landmark' || sub === 'trail'
        ? 75
        : sub === 'meal'
        ? 60
        : sub === 'souvenir'
        ? 25
        : 45),
  };
}

/**
 * Directly fetches public Google Maps metadata (og:title, og:description, expanded URL)
 * from the Google Maps URL itself — zero API key required!
 */
async function fetchGoogleMapsUrlMetadata(rawUrl: string): Promise<{
  expandedUrl: string;
  title?: string;
  address?: string;
  categoryLabel?: string;
  rating?: number;
  coords?: { lat: number; lng: number } | null;
}> {
  if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
    return { expandedUrl: rawUrl };
  }

  try {
    let fetchTarget = rawUrl.trim();
    const isShortLink =
      /maps\.app\.goo\.gl|goo\.gl\/maps|g\.co\/kgs|g\.page/i.test(fetchTarget);

    if (!isShortLink && fetchTarget.includes('google.com/maps') && !fetchTarget.includes('hl=')) {
      fetchTarget += fetchTarget.includes('?') ? '&hl=zh-TW' : '?hl=zh-TW';
    }

    const res = await fetch(fetchTarget, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(4000),
    });

    const expandedUrl = res.url || rawUrl;
    const coords = extractCoordsFromGoogleMapsUrl(expandedUrl);

    if (!res.ok) {
      return { expandedUrl, coords };
    }

    const html = await res.text();

    // Parse og:title (usually "店名 · 地址" or "店名 - Google 地圖")
    const ogTitleMatch =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
    // Parse og:description (usually "★★★★★ · 餐酒館" or "★★★★☆ · 表演藝術劇院")
    const ogDescMatch =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);

    let title: string | undefined;
    let address: string | undefined;
    let categoryLabel: string | undefined;
    let rating: number | undefined;

    if (ogTitleMatch?.[1]) {
      const rawOgTitle = ogTitleMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\s*[-–]\s*Google\s*(?:地圖|Maps)\s*$/i, '')
        .trim();

      if (rawOgTitle && !/^Google\s*(?:地圖|Maps)$/i.test(rawOgTitle)) {
        const parts = rawOgTitle.split(/\s*·\s*/);
        if (parts.length >= 2) {
          title = cleanStoreName(parts[0].trim());
          address = parts.slice(1).join(' ').trim();
        } else {
          title = cleanStoreName(rawOgTitle);
        }
      }
    }

    if (ogDescMatch?.[1]) {
      const rawOgDesc = ogDescMatch[1]
        .replace(/&amp;/g, '&')
        .replace(/&#39;/g, "'")
        .trim();
      const descParts = rawOgDesc.split(/\s*·\s*/);
      if (descParts.length >= 2) {
        const maybeCat = descParts[descParts.length - 1].trim();
        if (maybeCat && !/^[★☆\d.\s]+$/.test(maybeCat)) {
          categoryLabel = maybeCat;
        }
      }
      const starsMatch = rawOgDesc.match(/([★]+)/);
      if (starsMatch) {
        rating = starsMatch[1].length;
      }
    }

    return { expandedUrl, title, address, categoryLabel, rating, coords };
  } catch {
    return {
      expandedUrl: rawUrl,
      coords: extractCoordsFromGoogleMapsUrl(rawUrl),
    };
  }
}

/**
 * Master Google Maps URL Enricher:
 * Strictly uses the Google Maps URL as the primary reference to populate:
 * 1. Clean official store name (店名)
 * 2. Official category (分類)
 * 3. Official opening hours (營業時間)
 * 4. Official review summary / notes (說明/備註)
 * 5. Official address, district, rating, and business status
 */
export async function enrichPlaceFromGoogleMapsUrl(
  basePlace: SavedPlace,
  options: EnrichOptions
): Promise<SavedPlace> {
  const {
    googleMapsApiKey,
    geminiApiKey,
    categoryConfigs,
    hasUserCustomNote = false,
  } = options;

  let next: SavedPlace = { ...basePlace };
  let gotOfficialHours = false;
  let gotOfficialSummary = hasUserCustomNote;
  let gotOfficialCategory = false;

  const hasValidMapsKey =
    Boolean(googleMapsApiKey) &&
    googleMapsApiKey !== 'your-google-maps-api-key';
  const hasValidGeminiKey =
    Boolean(geminiApiKey) && geminiApiKey !== 'your-gemini-api-key';

  // Step 1: Fetch public metadata directly from the Google Maps URL in the CSV
  const urlMeta = await fetchGoogleMapsUrlMetadata(next.google_maps_url || '');
  if (urlMeta.expandedUrl && urlMeta.expandedUrl !== next.google_maps_url) {
    next.google_maps_url = urlMeta.expandedUrl;
  }
  if (urlMeta.coords) {
    next.latitude = Number(urlMeta.coords.lat.toFixed(6));
    next.longitude = Number(urlMeta.coords.lng.toFixed(6));
  }
  if (urlMeta.title && urlMeta.title.length >= 2) {
    next.name = urlMeta.title;
  } else {
    const urlName = extractPlaceNameFromGoogleMapsUrl(next.google_maps_url || '');
    if (urlName) {
      next.name = cleanStoreName(urlName);
    }
  }
  // Always separate glued address + store name (e.g. "330桃園市桃園區莊敬里中正路1428號叁拾捌號咖啡店")
  const sepName = separateNameAndAddress(next.name);
  if (sepName.foundAddress) {
    if (sepName.cleanName && sepName.cleanName.length >= 2) {
      next.name = cleanStoreName(sepName.cleanName) || sepName.cleanName;
    }
    if (!/[路街段巷弄號大道]/.test(next.formatted_address || '')) {
      next.formatted_address = sepName.foundAddress;
    }
    if (sepName.detectedCity) next.city = sepName.detectedCity;
    if (sepName.detectedDistrict) next.district = sepName.detectedDistrict;
    if (sepName.country) next.country = sepName.country;
  }
  if (urlMeta.address && /[路街段巷弄號大道]/.test(urlMeta.address)) {
    next.formatted_address = urlMeta.address;
    const reg = extractRegionFromAddress(
      urlMeta.address,
      { lat: next.latitude, lng: next.longitude },
      next.city
    );
    next.country = reg.country;
    next.city = reg.city;
    next.district = reg.district;
  }
  if (urlMeta.categoryLabel) {
    const mapped = mapGoogleCategoryToAppCategory(
      undefined,
      undefined,
      urlMeta.categoryLabel,
      next.name,
      categoryConfigs
    );
    if (mapped) {
      next.primary_category = mapped.primary_category;
      next.sub_category = mapped.sub_category;
      next.estimated_stay_mins = mapped.estimated_stay_mins;
      gotOfficialCategory = true;
    }
  }

  let gotOfficialDistrict = false;

  // Step 2: Google Places API (New) — Official Google Maps Data anchored to URL coords!
  if (!hasValidMapsKey) {
    (next as SavedPlace & { _syncDiagnostic?: string })._syncDiagnostic =
      '⚠️ 後端與設定皆未偵測到 Google Maps API Key（請確認 ⚙️ 設定或 Vercel 環境變數 GOOGLE_MAPS_API_KEY）';
  }
  if (hasValidMapsKey) {
    try {
      const formatPlacesErrorDiagnostic = (
        status: number,
        rawErrMsg?: string
      ): string => {
        const detailSuffix = rawErrMsg ? `｜原因：${rawErrMsg.slice(0, 140)}` : '';
        if (status === 429) {
          return `⚠️ Google Places API 配額已達上限（HTTP 429），已立即停止重試以節省額度${detailSuffix}`;
        }
        if (status === 403 || status === 401) {
          return `⚠️ Google Places API 金鑰權限不足或受限（HTTP ${status}），已停止重試${detailSuffix}`;
        }
        return `Google Places API 連線失敗（HTTP ${status}${
          rawErrMsg ? `: ${rawErrMsg.slice(0, 100)}` : ''
        }）`;
      };

      const existingPlaceId = (next.google_place_id || '').trim();
      const hasRealPlaceId =
        existingPlaceId.startsWith('ChIJ') &&
        !existingPlaceId.startsWith('ChIJ_') &&
        existingPlaceId.length >= 20;

      // Avoid AI summary / reviews fields (reviewSummary, generativeSummary, reviews) to prevent strict 429 limits & lower SKU tier
      const detailExtendedMask =
        'id,displayName,formattedAddress,addressComponents,location,rating,regularOpeningHours,currentOpeningHours,googleMapsUri,businessStatus,primaryType,types,primaryTypeDisplayName,editorialSummary';
      const detailSafeCoreMask =
        'id,displayName,formattedAddress,addressComponents,location,rating,regularOpeningHours,businessStatus,primaryType,types';
      const detailMinimalMask =
        'id,displayName,formattedAddress,location,rating,regularOpeningHours,businessStatus,types';

      const searchExtendedMask =
        'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.rating,places.regularOpeningHours,places.currentOpeningHours,places.googleMapsUri,places.businessStatus,places.primaryType,places.types,places.primaryTypeDisplayName,places.editorialSummary';
      const searchSafeCoreMask =
        'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.location,places.rating,places.regularOpeningHours,places.businessStatus,places.primaryType,places.types';
      const searchMinimalMask =
        'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.regularOpeningHours,places.businessStatus,places.types';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let top: any = null;
      let matchedViaPlaceDetails = false;
      let stoppedByQuotaOrAuth = false;
      let lastFailedRes: Response | null = null;

      // Step 2a: If we already have a real ChIJ google_place_id, prefer Place Details API (lower cost & exact match)
      if (hasRealPlaceId) {
        const detailMasks = [
          detailExtendedMask,
          detailSafeCoreMask,
          detailMinimalMask,
        ];
        for (const mask of detailMasks) {
          const detailRes = await fetch(
            `https://places.googleapis.com/v1/places/${encodeURIComponent(
              existingPlaceId
            )}?languageCode=zh-TW`,
            {
              method: 'GET',
              headers: {
                'X-Goog-Api-Key': googleMapsApiKey!,
                'X-Goog-FieldMask': mask,
              },
              signal: AbortSignal.timeout(5000),
            }
          );
          if (detailRes.ok) {
            top = await detailRes.json();
            matchedViaPlaceDetails = true;
            lastFailedRes = null;
            break;
          }
          lastFailedRes = detailRes;
          if (
            detailRes.status === 429 ||
            detailRes.status === 403 ||
            detailRes.status === 401
          ) {
            stoppedByQuotaOrAuth = true;
            break;
          }
          // 404 means place ID no longer exists; break out to allow searchText fallback
          if (detailRes.status === 404) break;
        }
      }

      // Step 2b: Fall back to Places Text Search only if Place Details didn't succeed AND we didn't hit 429/403/401
      if (!top && !stoppedByQuotaOrAuth) {
        const hasSpecificAddr = /[路街段巷弄號大道]/.test(
          next.formatted_address || ''
        );
        const textQuery = hasSpecificAddr
          ? `${next.name} ${next.formatted_address}`.trim()
          : `${next.name} ${next.city}`.trim();
        const requestBody: Record<string, unknown> = {
          textQuery,
          languageCode: 'zh-TW',
        };
        if (
          next.latitude &&
          next.longitude &&
          next.latitude > 20 &&
          next.latitude < 27
        ) {
          requestBody.locationBias = {
            circle: {
              center: { latitude: next.latitude, longitude: next.longitude },
              radius: 5000.0,
            },
          };
        }

        const tryMasks = [
          searchExtendedMask,
          searchSafeCoreMask,
          searchMinimalMask,
        ];

        for (const mask of tryMasks) {
          const placesRes = await fetch(
            'https://places.googleapis.com/v1/places:searchText',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': googleMapsApiKey!,
                'X-Goog-FieldMask': mask,
              },
              body: JSON.stringify(requestBody),
              signal: AbortSignal.timeout(5000),
            }
          );
          if (placesRes.ok) {
            const data = await placesRes.json();
            top = data.places?.[0] || null;
            lastFailedRes = null;
            break;
          }
          lastFailedRes = placesRes;
          // Immediately stop retrying on HTTP 429 (quota) / 403 / 401 (auth/permission)
          if (
            placesRes.status === 429 ||
            placesRes.status === 403 ||
            placesRes.status === 401
          ) {
            stoppedByQuotaOrAuth = true;
            break;
          }
        }
      }

      if (!top && lastFailedRes) {
        let rawErrMsg = '';
        try {
          const errJson = await lastFailedRes.json();
          if (errJson?.error?.message) {
            rawErrMsg = String(errJson.error.message);
          }
        } catch {}
        const diagMsg = formatPlacesErrorDiagnostic(
          lastFailedRes.status,
          rawErrMsg
        );
        console.warn('Google Places API failed:', lastFailedRes.status, rawErrMsg);
        (next as SavedPlace & { _syncDiagnostic?: string })._syncDiagnostic =
          diagMsg;
      } else if (!top) {
        (next as SavedPlace & { _syncDiagnostic?: string })._syncDiagnostic =
          `⚠️ Google Places 查無對應店家（「${next.name}」），請檢查店名或點🗺️地圖確認`;
      }

      if (top) {
        {
          // Never drift-reject an exact Place Details match; for text search, allow up to 25km if same city
          const hadExactUrlCoords = Boolean(
            extractCoordsFromGoogleMapsUrl(basePlace.google_maps_url || '')
          );
          const topAddr = String(top.formattedAddress || '').replace(/臺/g, '台');
          const normNextCity = (next.city || '').replace(/臺/g, '台');
          const isSameCity = Boolean(normNextCity && topAddr.includes(normNextCity));
          const maxAllowedDistM =
            hadExactUrlCoords && !isSameCity ? 5000 : 25000;
          let isDrifted = false;
          if (
            !matchedViaPlaceDetails &&
            next.latitude &&
            next.longitude &&
            top.location?.latitude &&
            top.location?.longitude
          ) {
            const distM = calculateDistanceMeters(
              next.latitude,
              next.longitude,
              top.location.latitude,
              top.location.longitude
            );
            if (distM > maxAllowedDistM) {
              isDrifted = true;
            }
          }

          if (isDrifted) {
            (next as SavedPlace & { _syncDiagnostic?: string })._syncDiagnostic =
              `⚠️ Google 回傳地點距離過遠（${top.displayName?.text || ''}），已略過以避免誤改`;
          }

          if (!isDrifted) {
            if (top.id) next.google_place_id = top.id;
            if (top.displayName?.text) {
              next.name = cleanStoreName(top.displayName.text);
            }
            if (top.location?.latitude && top.location?.longitude) {
              next.latitude = Number(top.location.latitude.toFixed(6));
              next.longitude = Number(top.location.longitude.toFixed(6));
            }
            if (top.formattedAddress) {
              next.formatted_address = top.formattedAddress;
              const officialReg = extractRegionFromAddress(
                top.formattedAddress,
                { lat: next.latitude, lng: next.longitude },
                next.city
              );
              next.country = officialReg.country;
              next.city = officialReg.city;
              next.district = officialReg.district;
              gotOfficialDistrict = true;
            }
            // Extract exact official city/district directly from Google Places addressComponents
            if (Array.isArray(top.addressComponents)) {
              const comps = top.addressComponents as Array<{
                longText?: string;
                types?: string[];
              }>;
              const compCity = comps.find(
                (c) =>
                  c.types?.includes('administrative_area_level_1') ||
                  c.types?.includes('administrative_area_level_2')
              )?.longText;
              const compDist = comps.find(
                (c) =>
                  c.types?.includes('administrative_area_level_3') ||
                  c.types?.includes('sublocality_level_1')
              )?.longText;
              if (compCity && /[市縣]$/.test(compCity)) {
                next.city = compCity.replace('臺', '台');
              }
              if (compDist && /[區市鎮鄉]$/.test(compDist)) {
                next.district = compDist;
                gotOfficialDistrict = true;
              }
            }
            if (typeof top.rating === 'number') {
              next.rating = top.rating;
            }
            if (
              top.businessStatus === 'OPERATIONAL' ||
              top.businessStatus === 'CLOSED_TEMPORARILY' ||
              top.businessStatus === 'CLOSED_PERMANENTLY'
            ) {
              next.business_status = top.businessStatus as BusinessStatus;
            }

            // Official Google Maps Category
            const mappedCat = mapGoogleCategoryToAppCategory(
              top.primaryType,
              top.types,
              top.primaryTypeDisplayName?.text,
              next.name,
              categoryConfigs
            );
            if (mappedCat) {
              next.primary_category = mappedCat.primary_category;
              next.sub_category = mappedCat.sub_category;
              next.estimated_stay_mins = mappedCat.estimated_stay_mins;
              gotOfficialCategory = true;
            }

            // Official Google Maps Opening Hours (check both regularOpeningHours and currentOpeningHours)
            const parsedHours = parseGoogleOpeningHours(
              top.regularOpeningHours || top.currentOpeningHours
            );
            if (parsedHours) {
              next.opening_hours_json = parsedHours;
              gotOfficialHours = true;
              (next as SavedPlace & { _syncDiagnostic?: string })._syncDiagnostic =
                '✅ 已從 Google Maps 同步最新資訊與營業時間';
            } else {
              (next as SavedPlace & { _syncDiagnostic?: string })._syncDiagnostic =
                '✅ 已連線 Google Maps（此地點於 Google 未登錄固定營業時間）';
            }

            // Official Google Maps Review Summary (only overwrite if user didn't supply a custom note)
            if (!hasUserCustomNote) {
              let officialSummary =
                top.reviewSummary?.text?.text ||
                (typeof top.reviewSummary?.text === 'string'
                  ? top.reviewSummary.text
                  : '') ||
                top.generativeSummary?.description?.text ||
                top.generativeSummary?.overview?.text ||
                top.editorialSummary?.text ||
                '';

              officialSummary = officialSummary.trim();

              // If Google Places returned an English reviewSummary despite languageCode=zh-TW,
              // translate it to Traditional Chinese (or prefer Traditional Chinese editorialSummary)
              if (officialSummary && !/[\u4e00-\u9fff]/.test(officialSummary)) {
                if (
                  top.editorialSummary?.text &&
                  /[\u4e00-\u9fff]/.test(top.editorialSummary.text)
                ) {
                  officialSummary = top.editorialSummary.text.trim();
                } else if (hasValidGeminiKey) {
                  try {
                    const ai = new GoogleGenAI({ apiKey: geminiApiKey! });
                    const tr = await ai.models.generateContent({
                      model: 'gemini-2.5-flash',
                      contents: `請將以下 Google Maps 評論摘要忠實翻譯為自然流暢的繁體中文（保留客觀歸納語氣，只輸出翻譯後的繁體中文，不加引號）：\n${officialSummary}`,
                    });
                    if (tr.text && /[\u4e00-\u9fff]/.test(tr.text)) {
                      officialSummary = tr.text.trim();
                    } else {
                      officialSummary = '';
                    }
                  } catch {
                    officialSummary = '';
                  }
                } else {
                  // Do not display raw English summary when Chinese editorial/curated is available
                  officialSummary = '';
                }
              }

              if (officialSummary && officialSummary.length > 5) {
                next.user_notes = officialSummary;
                gotOfficialSummary = true;
              } else if (
                Array.isArray(top.reviews) &&
                top.reviews.length > 0 &&
                hasValidGeminiKey
              ) {
                const reviewTexts = top.reviews
                  .map((r: { text?: { text?: string } }) => r?.text?.text)
                  .filter(Boolean)
                  .slice(0, 5);
                if (reviewTexts.length > 0) {
                  try {
                    const ai = new GoogleGenAI({ apiKey: geminiApiKey! });
                    const synth = await ai.models.generateContent({
                      model: 'gemini-2.5-flash',
                      contents: `以下是 Google Maps 上關於「${next.city}${next.district} ${next.name}」的真實評論：\n${reviewTexts
                        .map((t: string, i: number) => `${i + 1}. ${t}`)
                        .join('\n')}\n\n請濃縮成一段 50~95 字的 Google Maps 官方「評論摘要 (摘要由 Gemini 生成)」繁體中文摘要。只輸出內文，不加引號或標題。`,
                    });
                    if (synth.text && synth.text.trim().length > 10) {
                      next.user_notes = synth.text.trim();
                      gotOfficialSummary = true;
                    }
                  } catch {
                    // continue
                  }
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('Google Places API batch enrich error:', err);
    }
  }

  // Step 2.5: Polygon-exact Taiwan District Reverse Geocoding (BigDataCloud)
  // Guarantees 100% accurate Taiwan district boundaries (e.g. 三民區 vs 鼓山區, 苓雅區 vs 前金區)
  // even when Google Places API key is not configured!
  if (
    !gotOfficialDistrict &&
    next.country === '台灣' &&
    next.latitude >= 21.5 &&
    next.latitude <= 26.5 &&
    next.longitude >= 118.0 &&
    next.longitude <= 122.5
  ) {
    try {
      const bdcRes = await fetch(
        `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${next.latitude}&longitude=${next.longitude}&localityLanguage=zh`,
        { signal: AbortSignal.timeout(2500) }
      );
      if (bdcRes.ok) {
        const bdc = await bdcRes.json();
        const bdcCity = String(bdc.principalSubdivision || bdc.city || '')
          .replace('臺', '台')
          .trim();
        const bdcDist = String(bdc.locality || '').replace('臺', '台').trim();
        if (bdcCity && /[市縣]$/.test(bdcCity)) {
          next.city = bdcCity;
        }
        if (
          bdcDist &&
          /[區市鎮鄉]$/.test(bdcDist) &&
          bdcDist !== next.city &&
          bdcDist !== bdcCity
        ) {
          next.district = bdcDist;
          gotOfficialDistrict = true;
          if (!/[路街段巷弄號大道]/.test(next.formatted_address || '')) {
            next.formatted_address = `台灣${next.city}${next.district}`;
          }
        }
      }
    } catch {
      // ignore timeout
    }
  }

  // Step 3: Gemini with Google Maps Grounding (fills missing category, hours, review summary, and clean name)
  if (
    hasValidGeminiKey &&
    (!gotOfficialHours || !gotOfficialSummary || !gotOfficialCategory)
  ) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey! });
      const groundingPrompt = `請以 Google Maps 實際資料查詢以下地點：
- 網址：${next.google_maps_url}
- 名稱：${next.name}
- 區域：${next.city}${next.district}（座標：${next.latitude}, ${next.longitude}）

請嚴格回傳 JSON 物件（不要任何 Markdown 標記或額外說明），欄位如下：
{
  "name": "Google Maps 顯示的簡潔官方名稱（移除行銷括號）",
  "sub_category": "必須為 meal | snack_dessert | bar | souvenir | museum | landmark | trail 七選一（博物館/藝文中心選 museum，古蹟/廟宇/地標選 landmark，公園/步道選 trail，酒吧/餐酒館/精釀啤酒選 bar，咖啡/甜點/小吃選 snack_dessert，伴手禮選 souvenir，正餐餐廳選 meal）",
  "formatted_address": "完整台灣地址（含郵遞區號、縣市、行政區與門牌）",
  "weekday_description": "簡潔營業時間（例如：週二至週日 11:00–21:00，週一公休；或每日 17:30–01:00）",
  "open_time": "HH:MM（24小時制，如 11:00）",
  "close_time": "HH:MM（24小時制，如 21:00）",
  "review_summary": "50~95字繁體中文 Google Maps 官方「評論摘要 (摘要由 Gemini 生成)」風格，依真實屬性撰寫（景點用遊客表示/參觀者表示，餐飲用顧客表示），絕不可將展館或景點寫成餐廳"
}`;

      let rawText = '';
      try {
        const groundedResp = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: groundingPrompt,
          config: {
            tools: [{ googleMaps: {} }],
            ...(next.latitude && next.longitude
              ? {
                  toolConfig: {
                    retrievalConfig: {
                      latLng: {
                        latitude: next.latitude,
                        longitude: next.longitude,
                      },
                    },
                  },
                }
              : {}),
          },
        });
        rawText = (groundedResp.text || '').trim();
      } catch {
        const stdResp = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: groundingPrompt,
        });
        rawText = (stdResp.text || '').trim();
      }

      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          name?: string;
          sub_category?: string;
          formatted_address?: string;
          weekday_description?: string;
          open_time?: string;
          close_time?: string;
          review_summary?: string;
        };

        if (parsed.name && parsed.name.trim().length >= 2) {
          next.name = cleanStoreName(parsed.name.trim());
        }

        if (
          !gotOfficialCategory &&
          parsed.sub_category &&
          [
            'meal',
            'snack_dessert',
            'bar',
            'souvenir',
            'museum',
            'landmark',
            'trail',
          ].includes(parsed.sub_category)
        ) {
          const validSub = parsed.sub_category;
          const cfg = categoryConfigs.find((c) => c.sub_category === validSub);
          next.sub_category = validSub;
          next.primary_category =
            cfg?.primary_category ??
            (validSub === 'museum' || validSub === 'landmark'
              ? 'museum_culture'
              : validSub === 'trail'
              ? 'nature_outdoor'
              : 'restaurant');
          next.estimated_stay_mins =
            cfg?.default_stay_mins ?? next.estimated_stay_mins;
          gotOfficialCategory = true;
        }

        if (
          parsed.formatted_address &&
          /[路街段巷弄號大道]/.test(parsed.formatted_address) &&
          !/[路街段巷弄號大道]/.test(next.formatted_address || '')
        ) {
          next.formatted_address = parsed.formatted_address.trim();
        }

        if (!gotOfficialHours) {
          const wdText = (parsed.weekday_description || '').trim();
          let openNorm = '';
          let closeNorm = '';

          const normTime = (raw?: string): string => {
            if (!raw) return '';
            const m = raw.trim().match(/^(\d{1,2}):(\d{2})$/);
            if (!m) return '';
            return `${pad2(parseInt(m[1], 10))}:${m[2]}`;
          };

          openNorm = normTime(parsed.open_time);
          closeNorm = normTime(parsed.close_time);

          if (/24\s*小時|全天開放/i.test(wdText)) {
            openNorm = '00:00';
            closeNorm = '23:59';
          } else if ((!openNorm || !closeNorm) && wdText) {
            const tm = wdText.match(
              /(\d{1,2}):(\d{2})\s*[–\-~至到]\s*(\d{1,2}):(\d{2})/
            );
            if (tm) {
              openNorm = `${pad2(parseInt(tm[1], 10))}:${tm[2]}`;
              closeNorm = `${pad2(parseInt(tm[3], 10))}:${tm[4]}`;
            }
          }

          if (wdText || (openNorm && closeNorm)) {
            next.opening_hours_json = {
              open_now: true,
              weekday_descriptions: [
                wdText || `每日 ${openNorm}–${closeNorm}`,
              ],
              daily_hours:
                openNorm && closeNorm
                  ? { open: openNorm, close: closeNorm }
                  : { open: '10:00', close: '21:00' },
            };
            gotOfficialHours = true;
          }
        }

        if (
          !gotOfficialSummary &&
          parsed.review_summary &&
          parsed.review_summary.trim().length > 15
        ) {
          next.user_notes = parsed.review_summary.trim();
          gotOfficialSummary = true;
        }
      }
    } catch (err) {
      console.warn('Gemini Maps Grounding enrich error:', err);
    }
  }

  // Step 4: Final consistency check — ensure notes match the finalized category & name
  if (!gotOfficialSummary) {
    if (!gotOfficialCategory) {
      const inferred = inferPlaceCategoryByName(next.name);
      next.primary_category = inferred.primary_category;
      next.sub_category = inferred.sub_category;
      const cfg = categoryConfigs.find(
        (c) => c.sub_category === inferred.sub_category
      );
      next.estimated_stay_mins =
        cfg?.default_stay_mins ?? inferred.estimated_stay_mins;
    }
    next.user_notes = resolvePlaceDescription(
      next.name,
      next.city,
      next.district,
      next.sub_category,
      next.formatted_address
    );
  }

  return next;
}
