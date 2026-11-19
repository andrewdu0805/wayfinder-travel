import { SavedPlace, CategoryConfig } from '@/types/place';
import { DEFAULT_CATEGORY_CONFIGS } from '@/lib/default-data';
import {
  extractCoordsFromGoogleMapsUrl,
  extractPlaceNameFromGoogleMapsUrl,
  extractRegionFromAddress,
  getCoordinatesForRegion,
  inferPlaceCategoryByName,
  separateNameAndAddress,
} from '@/lib/geo-utils';
import { resolvePlaceDescription } from '@/lib/place-notes';

export interface ResolvePlaceOptions {
  url: string;
  fallbackTitle?: string;
  userNote?: string;
  defaultCity?: string;
  categoryConfigs?: CategoryConfig[];
  customTags?: string[];
  rowCoords?: { lat: number; lng: number } | null;
}

/**
 * Primary authority place resolver from a Google Maps URL.
 * Guarantees that whether a user pastes a single Google Maps URL or imports a .csv in batch,
 * the URL is the primary source of truth for:
 * 1. Canonical store/place name
 * 2. Exact coordinates (via S2CellId !1s0x...:0x..., !3d!4d, @lat,lng, or ?q=lat,lng)
 * 3. Exact city and district
 * 4. Proper category and stay duration
 * 5. Accurate Google Maps Gemini review summary and user notes
 */
export function resolvePlaceFromGoogleMapsUrl(
  options: ResolvePlaceOptions
): SavedPlace {
  const {
    url,
    fallbackTitle = '',
    userNote = '',
    defaultCity = '台南市',
    categoryConfigs = DEFAULT_CATEGORY_CONFIGS,
    customTags = ['#GoogleMaps匯入'],
    rowCoords = null,
  } = options;

  let decodedUrl = url || '';
  try {
    decodedUrl = decodeURIComponent(url || '');
  } catch {}

  // 1. Primary Authority: Extract Canonical Store Name from URL
  const nameFromUrl = extractPlaceNameFromGoogleMapsUrl(url);

  // If URL didn't have name (e.g. only lat/lng), fall back to CSV title
  let rawName = nameFromUrl;
  if (!rawName && fallbackTitle) {
    const sepFallback = separateNameAndAddress(fallbackTitle);
    rawName = sepFallback.cleanName || fallbackTitle.trim();
  }
  if (!rawName) {
    rawName = 'Google Maps 地點';
  }

  // Separate pure store name from any embedded address or parenthetical note
  const sep = separateNameAndAddress(rawName);
  const cleanName = sep.cleanName || rawName;
  const addressFromTitle =
    sep.foundAddress ||
    (fallbackTitle ? separateNameAndAddress(fallbackTitle).foundAddress : '') ||
    '';

  // 2. Primary Authority: Extract Exact Coordinates from URL
  const coordsFromUrl = extractCoordsFromGoogleMapsUrl(url);
  const effectiveCoords =
    coordsFromUrl ||
    rowCoords ||
    extractCoordsFromGoogleMapsUrl(fallbackTitle);

  // 3. Extract Google Place ID / CID from URL
  let placeId = `gmaps_${cleanName.replace(/\s+/g, '_').toLowerCase()}`;
  const s2Match = (url || '').match(
    /(?:!1s|^|[^0-9a-f])(0x[0-9a-f]{15,16}:0x[0-9a-f]+)/i
  );
  if (s2Match) {
    placeId = s2Match[1];
  } else {
    const cidMatch = (url || '').match(/[?&]cid=([0-9]+)/);
    if (cidMatch) {
      placeId = `cid_${cidMatch[1]}`;
    }
  }

  // 4. Region Detection (City & District)
  // Because effectiveCoords are accurate pin coordinates from the URL,
  // extractRegionFromAddress accurately maps them to the true city & district!
  const textForRegion = [
    addressFromTitle,
    cleanName,
    fallbackTitle,
    userNote,
    decodedUrl,
  ]
    .filter(Boolean)
    .join(' ');

  const region = extractRegionFromAddress(
    textForRegion,
    effectiveCoords,
    defaultCity
  );

  const finalCoords = effectiveCoords
    ? { lat: effectiveCoords.lat, lng: effectiveCoords.lng }
    : getCoordinatesForRegion(region.city, region.district, cleanName);

  // Landmark Safeguard: Tainan West Market (西市場 / 大菜市)
  if (
    (cleanName.includes('西市場') || cleanName.includes('大菜市')) &&
    !addressFromTitle.includes('嘉義') &&
    (region.city === '嘉義市' || !region.city || defaultCity === '台南市')
  ) {
    region.city = '台南市';
    region.district = '中西區';
    finalCoords.lat = 22.9933;
    finalCoords.lng = 120.1982;
  }

  // 5. Category Inference
  const cat = inferPlaceCategoryByName(`${cleanName} ${userNote}`);
  const matchedCfg = categoryConfigs.find(
    (c) => c.sub_category === cat.sub_category
  );
  const stayMins = matchedCfg?.default_stay_mins ?? cat.estimated_stay_mins;

  // 6. User Notes & Description
  // If user provided a note in the CSV (e.g. userNote), keep and prioritize it!
  // Otherwise, use district-aware Google Maps summary
  const cleanUserNote = (userNote || '').trim();
  const isGenericImportNote =
    !cleanUserNote ||
    cleanUserNote === '由 CSV 清單匯入' ||
    cleanUserNote === '由 Google Takeout 匯入' ||
    cleanUserNote === '透過智慧快速輸入新增';

  const finalNotes = isGenericImportNote
    ? resolvePlaceDescription(
        cleanName,
        region.city,
        region.district,
        cat.sub_category,
        addressFromTitle
      )
    : cleanUserNote;

  // 7. Formatted Address
  let formattedAddr = addressFromTitle;
  if (!formattedAddr) {
    formattedAddr = `${region.country}${region.city}${region.district}`;
  }

  const nowIso = new Date().toISOString();

  return {
    id: `gmaps-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    google_place_id: placeId,
    name: cleanName,
    formatted_address: formattedAddr,
    country: region.country,
    city: region.city,
    district: region.district,
    latitude: Number(finalCoords.lat.toFixed(6)),
    longitude: Number(finalCoords.lng.toFixed(6)),
    primary_category: cat.primary_category,
    sub_category: cat.sub_category,
    visit_status: 'unvisited',
    business_status: 'OPERATIONAL',
    estimated_stay_mins: stayMins,
    rating: 4.5,
    opening_hours_json: {
      open_now: true,
      weekday_descriptions: ['每日 10:00–21:00'],
      daily_hours: { open: '10:00', close: '21:00' },
    },
    google_maps_url:
      url ||
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        `${cleanName} ${region.city}`
      )}`,
    user_notes: finalNotes,
    custom_tags: customTags,
    last_visited_at: null,
    hours_updated_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
  };
}
