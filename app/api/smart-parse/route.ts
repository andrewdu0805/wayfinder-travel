import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { extractRegionFromAddress } from '@/lib/geo-utils';
import { CategoryConfig, SavedPlace, VisitStatus } from '@/types/place';
import { DEFAULT_CATEGORY_CONFIGS } from '@/lib/default-data';

interface KnownPlaceTemplate {
  keywords: string[];
  google_place_id: string;
  name: string;
  formatted_address: string;
  latitude: number;
  longitude: number;
  primary_category: string;
  sub_category: string;
  estimated_stay_mins: number;
  rating: number;
  daily_hours: { open: string; close: string };
  default_notes: string;
  tags: string[];
}

const BUILTIN_GAZETTEER: KnownPlaceTemplate[] = [
  {
    keywords: ['大溝頂虱目魚', 'khGushanSabaoMilkfish', '虱目魚米粉湯'],
    google_place_id: 'ChIJ_dagouding_milkfish_kh',
    name: '大溝頂虱目魚米粉湯',
    formatted_address: '803台灣高雄市鹽埕區新樂街198-38號',
    latitude: 22.6251,
    longitude: 120.2836,
    primary_category: 'restaurant',
    sub_category: 'meal',
    estimated_stay_mins: 50,
    rating: 4.4,
    daily_hours: { open: '05:30', close: '13:30' },
    default_notes: '鹽埕公有市場人氣鮮魚肚漿湯與魚皮湯',
    tags: ['#傳統早午餐', '#鹽埕市場'],
  },
  {
    keywords: ['銀座聚場', 'Takao Ginza'],
    google_place_id: 'ChIJ_takao_ginza_cafe_kh',
    name: '銀座聚場 Takao Ginza',
    formatted_address: '803台灣高雄市鹽埕區五福四路260巷8號',
    latitude: 22.6240,
    longitude: 120.2823,
    primary_category: 'restaurant',
    sub_category: 'snack_dessert',
    estimated_stay_mins: 60,
    rating: 4.6,
    daily_hours: { open: '13:00', close: '19:00' },
    default_notes: '高雄第一座百貨拱廊改建老屋咖啡館，招牌焦糖昭和布丁與手沖咖啡',
    tags: ['#老屋咖啡', '#昭和布丁', '#下午茶'],
  },
  {
    keywords: ['港園牛肉麵'],
    google_place_id: 'ChIJ_gangyuan_beef_noodle_kh',
    name: '港園牛肉麵 (大成街總店)',
    formatted_address: '803台灣高雄市鹽埕區大成街55號',
    latitude: 22.6218,
    longitude: 120.2869,
    primary_category: 'restaurant',
    sub_category: 'meal',
    estimated_stay_mins: 60,
    rating: 4.3,
    daily_hours: { open: '10:30', close: '20:00' },
    default_notes: '鹽埕六十年老店，必點牛肉拌麵與豬腳拌麵配蒜泥',
    tags: ['#牛肉拌麵', '#老字號正餐'],
  },
  {
    keywords: ['不二緻果', '高雄不二家', '真芋頭'],
    google_place_id: 'ChIJ_fuer_taro_cake_kh',
    name: '不二緻果【高雄不二家】中正本舖',
    formatted_address: '800台灣高雄市新興區中正四路31號',
    latitude: 22.6312,
    longitude: 120.3015,
    primary_category: 'restaurant',
    sub_category: 'souvenir',
    estimated_stay_mins: 20,
    rating: 4.5,
    daily_hours: { open: '08:30', close: '21:30' },
    default_notes: '高雄超人氣真芋頭蛋糕與拿破崙派伴手禮',
    tags: ['#芋頭控', '#高雄伴手禮'],
  },
  {
    keywords: ['鴨肉珍'],
    google_place_id: 'ChIJ_duck_zhen_yancheng',
    name: '鴨肉珍 (五福四路總店)',
    formatted_address: '803台灣高雄市鹽埕區五福四路258號',
    latitude: 22.6238,
    longitude: 120.2820,
    primary_category: 'restaurant',
    sub_category: 'meal',
    estimated_stay_mins: 60,
    rating: 4.4,
    daily_hours: { open: '10:00', close: '20:20' },
    default_notes: '米其林必比登推薦鴨肉飯與下水湯',
    tags: ['#必比登', '#老店'],
  },
  {
    keywords: ['內惟藝術中心'],
    google_place_id: 'ChIJ_neiwei_arts_center_kh',
    name: '內惟藝術中心 Neiwei Arts Center',
    formatted_address: '804台灣高雄市鼓山區馬卡道路329號',
    latitude: 22.6562,
    longitude: 120.2814,
    primary_category: 'museum_culture',
    sub_category: 'museum',
    estimated_stay_mins: 110,
    rating: 4.7,
    daily_hours: { open: '11:00', close: '21:00' },
    default_notes: '純白波浪建築結合展覽、修復中心與輕食咖啡',
    tags: ['#美術館', '#純白建築'],
  },
  {
    keywords: ['鈴鹿賽道樂園', 'SKM Park'],
    google_place_id: 'ChIJ_suzuka_circuit_park_kh',
    name: '鈴鹿賽道樂園 Suzuka Circuit Park',
    formatted_address: '806台灣高雄市前鎮區中安路1-1號',
    latitude: 22.5831,
    longitude: 120.3292,
    primary_category: 'theme_park_leisure',
    sub_category: 'amusement_park',
    estimated_stay_mins: 240,
    rating: 4.5,
    daily_hours: { open: '11:00', close: '21:00' },
    default_notes: '日本鈴鹿賽道海外唯一授權卡丁車主題樂園',
    tags: ['#卡丁車', '#主題樂園'],
  },
];

function inferCategoryHeuristic(
  text: string,
  configs: CategoryConfig[]
): {
  primary_category: string;
  sub_category: string;
  estimated_stay_mins: number;
  visit_status: VisitStatus;
} {
  const lower = text.toLowerCase();
  const visit_status: VisitStatus =
    lower.includes('去過不推') || lower.includes('雷')
      ? 'visited_skip'
      : lower.includes('去過') || lower.includes('二訪') || lower.includes('再訪')
      ? 'visited_revisit'
      : 'unvisited';

  const findStay = (sub: string, fallback: number) =>
    configs.find((c) => c.sub_category === sub)?.default_stay_mins ?? fallback;

  if (
    /伴手禮|名產|禮盒|蛋糕店|餅店|糕餅|銅鑼燒|肉紙|鳳梨酥|不二緻果|巴堂|舊振南/.test(
      text
    )
  ) {
    return {
      primary_category: 'restaurant',
      sub_category: 'souvenir',
      estimated_stay_mins: findStay('souvenir', 20),
      visit_status,
    };
  }
  if (
    /咖啡|甜點|冰|奶茶|下午茶|布丁|豆花|水煎包|車輪餅|雞蛋糕|和菓子|cafe|coffee/.test(
      lower
    )
  ) {
    return {
      primary_category: 'restaurant',
      sub_category: 'snack_dessert',
      estimated_stay_mins: findStay('snack_dessert', 45),
      visit_status,
    };
  }
  if (/博物館|美術館|展覽|特區|藝術館|歷史館|鐵道館|museum|gallery/.test(lower)) {
    return {
      primary_category: 'museum_culture',
      sub_category: 'museum',
      estimated_stay_mins: findStay('museum', 120),
      visit_status,
    };
  }
  if (/古蹟|神社|寺|廟|城隍|雷門|地標|景觀台/.test(lower)) {
    return {
      primary_category: 'museum_culture',
      sub_category: 'landmark',
      estimated_stay_mins: findStay('landmark', 60),
      visit_status,
    };
  }
  if (/樂園|遊樂場|卡丁車|摩天輪|樂園/.test(lower)) {
    return {
      primary_category: 'theme_park_leisure',
      sub_category: 'amusement_park',
      estimated_stay_mins: findStay('amusement_park', 240),
      visit_status,
    };
  }
  if (/步道|公園|森林|海岸|看海|風景|山/.test(lower)) {
    return {
      primary_category: 'nature_outdoor',
      sub_category: 'trail',
      estimated_stay_mins: findStay('trail', 90),
      visit_status,
    };
  }
  if (/市集|百貨|商圈|選物|購物/.test(lower)) {
    return {
      primary_category: 'shopping',
      sub_category: 'other',
      estimated_stay_mins: findStay('other', 60),
      visit_status,
    };
  }
  return {
    primary_category: 'restaurant',
    sub_category: 'meal',
    estimated_stay_mins: findStay('meal', 90),
    visit_status,
  };
}

function extractCustomTags(text: string): string[] {
  const matches = text.match(/#[^\s#,，。！!？?]+/g);
  return matches ? Array.from(new Set(matches)) : [];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const rawInput: string = (body.input || '').trim();
    const defaultCity: string = body.defaultCity || '高雄市';
    const categoryConfigs: CategoryConfig[] =
      body.categoryConfigs || DEFAULT_CATEGORY_CONFIGS;

    const geminiApiKey =
      body.geminiApiKey || process.env.GEMINI_API_KEY || '';
    const googleMapsApiKey =
      body.googleMapsApiKey || process.env.GOOGLE_MAPS_API_KEY || '';

    if (!rawInput) {
      return NextResponse.json(
        { error: '請輸入 Google Maps 連結、店名或推薦文案' },
        { status: 400 }
      );
    }

    let resolvedInput = rawInput;
    // Step 1: If input contains a short URL (maps.app.goo.gl / goo.gl), try resolving redirect if possible
    const urlMatch = rawInput.match(/https?:\/\/[^\s)]+/i);
    if (
      urlMatch &&
      (urlMatch[0].includes('maps.app.goo.gl') ||
        urlMatch[0].includes('goo.gl/maps'))
    ) {
      try {
        const res = await fetch(urlMatch[0], {
          method: 'HEAD',
          redirect: 'follow',
          signal: AbortSignal.timeout(3500),
        });
        if (res.url && res.url !== urlMatch[0]) {
          const decodedUrl = decodeURIComponent(res.url);
          resolvedInput = `${rawInput} [展開網址: ${decodedUrl}]`;
        }
      } catch {
        // Ignore network redirect errors in sandboxed/offline mode and rely on input text
      }
    }

    const nowIso = new Date().toISOString();
    const parsedPlaces: SavedPlace[] = [];

    // Step 2: Check if built-in gazetteer matches one or multiple stores in the input (fast & deterministic for demo/common places)
    const matchedTemplates = BUILTIN_GAZETTEER.filter((tpl) =>
      tpl.keywords.some((kw) =>
        resolvedInput.toLowerCase().includes(kw.toLowerCase())
      )
    );

    if (matchedTemplates.length > 0 && !googleMapsApiKey) {
      const userHashtags = extractCustomTags(rawInput);
      const isUpsertNote =
        rawInput.includes('—') || rawInput.includes('-')
          ? rawInput.split(/[—-]/).slice(1).join(' ').trim()
          : '';

      for (const tpl of matchedTemplates) {
        const region = extractRegionFromAddress(tpl.formatted_address);
        const heuristic = inferCategoryHeuristic(rawInput, categoryConfigs);
        parsedPlaces.push({
          id: `place-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          google_place_id: tpl.google_place_id,
          name: tpl.name,
          formatted_address: tpl.formatted_address,
          country: region.country,
          city: region.city,
          district: region.district,
          latitude: tpl.latitude,
          longitude: tpl.longitude,
          primary_category: tpl.primary_category,
          sub_category: tpl.sub_category,
          visit_status:
            heuristic.visit_status !== 'unvisited'
              ? heuristic.visit_status
              : 'unvisited',
          business_status: 'OPERATIONAL',
          estimated_stay_mins: tpl.estimated_stay_mins,
          rating: tpl.rating,
          opening_hours_json: {
            open_now: true,
            weekday_descriptions: [
              `每日 ${tpl.daily_hours.open}–${tpl.daily_hours.close}`,
            ],
            daily_hours: tpl.daily_hours,
          },
          google_maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            tpl.name
          )}`,
          user_notes: isUpsertNote || tpl.default_notes,
          custom_tags: Array.from(new Set([...tpl.tags, ...userHashtags])),
          last_visited_at: null,
          hours_updated_at: nowIso,
          created_at: nowIso,
          updated_at: nowIso,
        });
      }

      return NextResponse.json({
        places: parsedPlaces,
        mode: 'smart_gazetteer',
      });
    }

    // Step 3: If Gemini API Key is available, use @google/genai to extract 1..N places & classify them strictly per spec
    let extractedCandidates: Array<{
      name: string;
      addressHint: string;
      primary_category: string;
      sub_category: string;
      visit_status: VisitStatus;
      estimated_stay_mins: number;
      user_notes: string;
      custom_tags: string[];
    }> = [];

    if (geminiApiKey && geminiApiKey !== 'your-gemini-api-key') {
      try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const validSubCategories = categoryConfigs.map((c) => c.sub_category);
        const validPrimaries = Array.from(
          new Set(categoryConfigs.map((c) => c.primary_category))
        );

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `你是一位精準的旅遊資料分類器與地點擷取引擎。請從以下使用者貼上的內容（可能是單筆店名、Google Maps 連結、或整段 IG/部落格多店推薦文案）擷取出所有提到的具體店家或景點，並依規則分類：
1. 若為餐飲類，primary_category 必為 "restaurant"，且細分 sub_category 為 "meal"（正餐）、"snack_dessert"（點心/咖啡/下午茶）、"souvenir"（伴手禮/名產）。
2. 若為博物館、美術館、文化園區或古蹟，primary_category 為 "museum_culture"，sub_category 為 "museum" 或 "landmark"。
3. 若為主題樂園，primary_category 為 "theme_park_leisure"，sub_category 為 "amusement_park"。
4. 若備註有明確提到「去過」，則 visit_status 為 "visited_revisit"，否則預設為 "unvisited"。
預設所在城市提示：${defaultCity}

使用者輸入內容：
${resolvedInput}`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  addressHint: { type: Type.STRING },
                  primary_category: {
                    type: Type.STRING,
                    enum: validPrimaries,
                  },
                  sub_category: {
                    type: Type.STRING,
                    enum: validSubCategories,
                  },
                  visit_status: {
                    type: Type.STRING,
                    enum: ['unvisited', 'visited_revisit', 'visited_skip'],
                  },
                  estimated_stay_mins: { type: Type.INTEGER },
                  user_notes: { type: Type.STRING },
                  custom_tags: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                  },
                },
                required: [
                  'name',
                  'primary_category',
                  'sub_category',
                  'visit_status',
                  'estimated_stay_mins',
                  'user_notes',
                ],
              },
            },
          },
        });

        if (response.text) {
          extractedCandidates = JSON.parse(response.text);
        }
      } catch (err) {
        console.warn('Gemini parse fallback triggered:', err);
      }
    }

    // Step 4: Fallback intelligent text splitter if Gemini key wasn't provided
    if (extractedCandidates.length === 0) {
      // Check if text has quoted store names like 「店名」 or 『店名』 or multiple lines
      const quotedMatches = Array.from(
        rawInput.matchAll(/[「『【]([^」』】]{2,22})[」』】]/g)
      ).map((m) => m[1].trim());

      const rawNames =
        quotedMatches.length > 0
          ? quotedMatches
          : rawInput
              .split(/\n|；|;/)
              .map((s) => s.trim())
              .filter(Boolean);

      for (const rawItem of rawNames) {
        // Clean URL and notes from name
        const withoutUrl = rawItem.replace(/https?:\/\/[^\s)]+/gi, '').trim();
        const parts = withoutUrl.split(/\s+[—\-｜|]\s+|\s*\(([^)]+)\)\s*/);
        const cleanName =
          (parts[0] || withoutUrl).replace(/^[0-9.、・\s]+/, '').trim() ||
          '新收藏景點';
        const notePart =
          parts.slice(1).filter(Boolean).join(' ') ||
          (quotedMatches.length > 0 ? rawInput : '');
        const heuristic = inferCategoryHeuristic(
          `${cleanName} ${notePart}`,
          categoryConfigs
        );

        extractedCandidates.push({
          name: cleanName,
          addressHint: defaultCity,
          primary_category: heuristic.primary_category,
          sub_category: heuristic.sub_category,
          visit_status: heuristic.visit_status,
          estimated_stay_mins: heuristic.estimated_stay_mins,
          user_notes: notePart || '透過智慧快速輸入新增',
          custom_tags: extractCustomTags(rawInput),
        });
      }
    }

    // Step 5: Enrich each candidate with Google Places API (New) if key is available, or smart city coordinates
    const cityCenterMap: Record<string, { lat: number; lng: number; dist: string; country: string }> = {
      高雄市: { lat: 22.6238, lng: 120.2838, dist: '鹽埕區', country: '台灣' },
      台北市: { lat: 25.0568, lng: 121.5098, dist: '大同區', country: '台灣' },
      東京都: { lat: 35.7118, lng: 139.7965, dist: '台東區', country: '日本' },
    };
    const baseCenter = cityCenterMap[defaultCity] || cityCenterMap['高雄市'];

    for (let i = 0; i < extractedCandidates.length; i++) {
      const cand = extractedCandidates[i];
      let placeId = `custom_${cand.name.replace(/\s+/g, '_').toLowerCase()}`;
      let formattedAddress = `${baseCenter.country}${defaultCity}${baseCenter.dist}${cand.name}`;
      let lat = baseCenter.lat + (Math.sin(i * 1.9 + cand.name.length) * 0.0045);
      let lng = baseCenter.lng + (Math.cos(i * 1.9 + cand.name.length) * 0.0045);
      let rating: number | null = 4.5;
      let weekdayDescriptions = ['每日 10:00–21:00'];
      let dailyHours = { open: '10:00', close: '21:00' };

      if (googleMapsApiKey && googleMapsApiKey !== 'your-google-maps-api-key') {
        try {
          const placesRes = await fetch(
            'https://places.googleapis.com/v1/places:searchText',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': googleMapsApiKey,
                'X-Goog-FieldMask':
                  'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.regularOpeningHours,places.googleMapsUri,places.businessStatus',
              },
              body: JSON.stringify({
                textQuery: `${cand.name} ${cand.addressHint || defaultCity}`,
                languageCode: 'zh-TW',
              }),
              signal: AbortSignal.timeout(5000),
            }
          );
          if (placesRes.ok) {
            const placesData = await placesRes.json();
            const top = placesData.places?.[0];
            if (top) {
              placeId = top.id || placeId;
              formattedAddress = top.formattedAddress || formattedAddress;
              lat = top.location?.latitude ?? lat;
              lng = top.location?.longitude ?? lng;
              rating = top.rating ?? rating;
              if (top.regularOpeningHours?.weekdayDescriptions) {
                weekdayDescriptions = top.regularOpeningHours.weekdayDescriptions;
              }
            }
          }
        } catch (err) {
          console.warn('Google Places API lookup fallback:', err);
        }
      }

      const region = extractRegionFromAddress(formattedAddress);

      parsedPlaces.push({
        id: `place-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        google_place_id: placeId,
        name: cand.name,
        formatted_address: formattedAddress,
        country: region.country,
        city: region.city,
        district: region.district,
        latitude: Number(lat.toFixed(6)),
        longitude: Number(lng.toFixed(6)),
        primary_category: cand.primary_category,
        sub_category: cand.sub_category,
        visit_status: cand.visit_status,
        business_status: 'OPERATIONAL',
        estimated_stay_mins: cand.estimated_stay_mins,
        rating,
        opening_hours_json: {
          open_now: true,
          weekday_descriptions: weekdayDescriptions,
          daily_hours: dailyHours,
        },
        google_maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${cand.name} ${region.city}`
        )}`,
        user_notes: cand.user_notes,
        custom_tags: cand.custom_tags || [],
        last_visited_at: null,
        hours_updated_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      });
    }

    return NextResponse.json({
      places: parsedPlaces,
      mode: geminiApiKey ? 'gemini_plus_places' : 'smart_local_parser',
    });
  } catch (error) {
    console.error('Smart parse error:', error);
    return NextResponse.json(
      { error: '解析輸入時發生錯誤，請稍後再試' },
      { status: 500 }
    );
  }
}
