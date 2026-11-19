import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import {
  extractCoordsFromGoogleMapsUrl,
  extractRegionFromAddress,
  getCoordinatesForRegion,
  separateNameAndAddress,
} from '@/lib/geo-utils';
import { resolvePlaceDescription } from '@/lib/place-notes';
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
  {
    keywords: ['王家燻羊肉', '燻羊肉', '龍崎燻羊肉'],
    google_place_id: 'ChIJ_wang_smoked_goat_tainan',
    name: '王家燻羊肉',
    formatted_address: '719台灣台南市龍崎區土崎里烏樹林34號',
    latitude: 22.9515,
    longitude: 120.385,
    primary_category: 'restaurant',
    sub_category: 'meal',
    estimated_stay_mins: 80,
    rating: 4.2,
    daily_hours: { open: '11:00', close: '19:00' },
    default_notes: '台南龍崎在地深山古法稻殼燻羊肉，肉質細嫩無羶味，必點燻羊肉與蒜油麵線',
    tags: ['#台南美食', '#古法燻羊肉', '#龍崎必吃'],
  },
  {
    keywords: ['總爺藝文中心', '總爺糖廠', '總爺', '麻豆總爺'],
    google_place_id: 'ChIJ_zongye_arts_center_tainan',
    name: '總爺藝文中心',
    formatted_address: '721台灣台南市麻豆區南勢里總爺5號',
    latitude: 23.1873,
    longitude: 120.2599,
    primary_category: 'museum_culture',
    sub_category: 'landmark',
    estimated_stay_mins: 90,
    rating: 4.5,
    daily_hours: { open: '09:00', close: '17:00' },
    default_notes: '明治製糖總爺工場古蹟建築群，綠意林蔭樟樹大道與紅磚洋樓工藝展館，漫步散心與賞析當代藝術展覽好去處',
    tags: ['#市定古蹟', '#藝文特區', '#林蔭大道'],
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
    /伴手禮|名產|禮盒|蛋糕店|餅店|糕餅|銅鑼燒|肉紙|鳳梨酥|蜜餞|不二緻果|巴堂|舊振南/.test(
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
    /咖啡|甜點|冰|奶茶|下午茶|布丁|豆花|水煎包|車輪餅|雞蛋糕|和菓子|泡芙|鬆餅|烘焙|cafe|coffee|bakery|dessert/.test(
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
  if (
    /藝文中心|文化中心|藝術中心|文化園區|文創園區|博物館|美術館|展覽館|展覽|特區|藝術館|歷史館|鐵道館|糖廠|工坊|藝文|展演|故事館|紀念館|museum|gallery|art center/.test(
      lower
    )
  ) {
    return {
      primary_category: 'museum_culture',
      sub_category: 'museum',
      estimated_stay_mins: findStay('museum', 120),
      visit_status,
    };
  }
  if (
    /古蹟|神社|寺|廟|宮|城隍|雷門|地標|景觀台|老街|砲台|燈塔|城門|堡/.test(
      lower
    )
  ) {
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
    const rawDefaultCity: string = (body.defaultCity || '').trim();
    const defaultCity: string = rawDefaultCity || '台南市';
    const skipGemini: boolean = Boolean(body.skipGemini);
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
    let urlDetectedName: string | undefined;
    let urlDetectedAddress: string | undefined;
    let urlDetectedCoords: { lat: number; lng: number } | undefined =
      extractCoordsFromGoogleMapsUrl(rawInput) || undefined;

    // Step 1: Detect Google Maps short URLs or desktop URLs and extract destination metadata
    const urlMatch = rawInput.match(/https?:\/\/[^\s)]+/i);
    if (urlMatch) {
      const targetUrl = urlMatch[0];
      // Only fetch URL over network if it's a short link (maps.app.goo.gl / goo.gl) or we don't have coordinates yet
      const isShortUrl = /goo\.gl|maps\.app/i.test(targetUrl);
      if (isShortUrl || !urlDetectedCoords) {
        try {
          const res = await fetch(targetUrl, {
            method: 'GET',
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(3500),
          });

          const finalUrl = res.url || targetUrl;
          const decodedUrl = decodeURIComponent(finalUrl);
          resolvedInput = `${rawInput} [展開網址: ${decodedUrl}]`;

          const extractedFromFinal = extractCoordsFromGoogleMapsUrl(decodedUrl);
          if (extractedFromFinal) {
            urlDetectedCoords = extractedFromFinal;
          }

        // 1. Parse HTML title tag (e.g. <title>阿蓮牛肉湯 - Google 地圖</title>)
        const html = await res.text();
        const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
        if (titleMatch) {
          const cleanTitle = titleMatch[1]
            .replace(/\s*[-–—|·]\s*(Google\s*(Maps|地圖)|Google).*$/i, '')
            .trim();
          if (
            cleanTitle &&
            !cleanTitle.includes('Google 地圖') &&
            !cleanTitle.includes('Google Maps')
          ) {
            const sepTitle = separateNameAndAddress(cleanTitle);
            if (sepTitle.cleanName) urlDetectedName = sepTitle.cleanName;
            if (sepTitle.foundAddress) urlDetectedAddress = sepTitle.foundAddress;
          }
        }

        // 2. Parse HTML OpenGraph metadata
        const ogTitleMatch =
          html.match(
            /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']+)["']/i
          ) ||
          html.match(
            /<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:title["']/i
          );
        if (
          ogTitleMatch &&
          ogTitleMatch[1] &&
          !ogTitleMatch[1].includes('Google Maps') &&
          !ogTitleMatch[1].includes('Google 地圖')
        ) {
          const parts = ogTitleMatch[1].split(/·|-/).map((s) => s.trim());
          if (parts[0]) {
            const sep0 = separateNameAndAddress(parts[0]);
            if (sep0.cleanName) urlDetectedName = sep0.cleanName;
            if (sep0.foundAddress && !urlDetectedAddress) {
              urlDetectedAddress = sep0.foundAddress;
            }
          }
          if (parts[1]) {
            const sep1 = separateNameAndAddress(parts[1]);
            if (sep1.foundAddress) {
              urlDetectedAddress = sep1.foundAddress;
            } else if (!urlDetectedAddress) {
              urlDetectedAddress = parts[1];
            }
          }
        }

        // 3. Check /place/<PlaceName>, /search/<Query>, or ?q=<Query> in URL
        const placeMatch =
          decodedUrl.match(/\/(?:place|search)\/([^/@?]+)/) ||
          decodedUrl.match(/[?&]q=([^&]+)/);
        if (placeMatch) {
          const placeRaw = placeMatch[1].replace(/\+/g, ' ').trim();
          const sepPlace = separateNameAndAddress(placeRaw);
          if (sepPlace.foundAddress && !urlDetectedAddress) {
            urlDetectedAddress = sepPlace.foundAddress;
          }
          if (sepPlace.cleanName && !urlDetectedName) {
            urlDetectedName = sepPlace.cleanName;
          } else if (!urlDetectedName && !sepPlace.foundAddress) {
            urlDetectedName = placeRaw;
          }
        }

        if (urlDetectedName || urlDetectedAddress) {
          resolvedInput = `${rawInput}\n[展開網址: ${decodedUrl}]\n[系統預先分離純店名: ${
            urlDetectedName || ''
          }]\n[系統預先分離地址: ${urlDetectedAddress || ''}]`;
        }
        } catch {
          // Fall back to text parsing if network request is blocked or times out
        }
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

    if (!skipGemini && geminiApiKey && geminiApiKey !== 'your-gemini-api-key') {
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
5. 【極重要】name 欄位「絕對不可」包含任何縣市、鄉鎮市區、村里鄰、路街段巷弄號、大道或郵遞區號等地址字串（例如若輸入為「臺南市中正路1號永華里湯德章大道國立臺灣文學館」，name 必須僅為「國立臺灣文學館 National Museum of Taiwan Literature」，地址請放入 addressHint）。若系統已提供「[系統預先分離純店名]」，請優先採用該純店名。
6. 【說明備註 user_notes】：若使用者輸入未包含個人特殊備註，請結合 Google Maps 上的店家特點、招牌必吃推薦或景點特色，為該地點寫一句 15~35 字生動精準的 Google Maps 風格亮點說明句（例如：「夏林路傳承40餘年老字號米糕，米糕Q彈淋上濃郁肉燥配旗魚鬆與四神湯」、「人氣創意調酒餐酒館，以電影為靈感設計特色特調與下酒料理」），切勿留空或填寫敷衍罐頭文字。
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
      // Check if text has quoted store names like 「店名」 or 『店名』
      const quotedMatches = Array.from(
        rawInput.matchAll(/[「『【]([^」』】]{2,30})[」』】]/g)
      ).map((m) => m[1].trim());

      // Check if lines contain address or store names from Google Maps share text
      const rawLines = rawInput
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);

      let foundStoreName = urlDetectedName || '';
      let foundAddress = urlDetectedAddress || '';

      // Check rawInput with separateNameAndAddress
      const rawSep = separateNameAndAddress(rawInput);
      if (rawSep.foundAddress && !foundAddress) {
        foundAddress = rawSep.foundAddress;
      }
      if (rawSep.cleanName && !foundStoreName && rawSep.cleanName !== rawInput) {
        foundStoreName = rawSep.cleanName;
      }

      for (const line of rawLines) {
        if (/https?:\/\//i.test(line)) continue;
        const lineSep = separateNameAndAddress(line);
        if (lineSep.foundAddress && !foundAddress) {
          foundAddress = lineSep.foundAddress;
        }
        if (lineSep.cleanName && !foundStoreName && lineSep.cleanName !== line) {
          foundStoreName = lineSep.cleanName;
        }
        if (
          /^[0-9.]+\s*★|★+|已打烊|開始營業|營業中|查看附近的餐廳|儲存至/.test(
            line
          )
        ) {
          continue;
        }
        const cleaned = line
          .replace(/^[在於\s]*Google\s*地圖上查看[「『【\s:]*/i, '')
          .replace(/[」』】:：]/g, '')
          .trim();
        if (cleaned && !foundStoreName && cleaned.length <= 40) {
          foundStoreName = cleaned;
        }
      }

      const rawNames =
        quotedMatches.length > 0
          ? quotedMatches
          : foundStoreName
          ? [foundStoreName]
          : rawInput
              .split(/\n|；|;/)
              .map((s) => s.trim())
              .filter(Boolean);

      for (const rawItem of rawNames) {
        const withoutUrl = rawItem.replace(/https?:\/\/[^\s)]+/gi, '').trim();
        const sepItem = separateNameAndAddress(withoutUrl);
        const candidateName = sepItem.cleanName || withoutUrl;
        const candidateAddress = sepItem.foundAddress || foundAddress;

        const parts = candidateName.split(/\s+[—\-｜|]\s+|\s*\(([^)]+)\)\s*/);
        const cleanName =
          (parts[0] || candidateName).replace(/^[0-9.、・\s]+/, '').trim() ||
          foundStoreName ||
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
          addressHint: candidateAddress || '',
          primary_category: heuristic.primary_category,
          sub_category: heuristic.sub_category,
          visit_status: heuristic.visit_status,
          estimated_stay_mins: heuristic.estimated_stay_mins,
          user_notes: notePart || '透過智慧快速輸入新增',
          custom_tags: extractCustomTags(rawInput),
        });
      }
    }

    // Step 5: Enrich each candidate with Google Places API if key is available, or smart city coordinates
    const cityCenterMap: Record<
      string,
      { lat: number; lng: number; dist: string; country: string }
    > = {
      台南市: { lat: 22.9905, lng: 120.191, dist: '中西區', country: '台灣' },
      高雄市: { lat: 22.6238, lng: 120.2838, dist: '鹽埕區', country: '台灣' },
      台北市: { lat: 25.0568, lng: 121.5098, dist: '大同區', country: '台灣' },
      新北市: { lat: 25.0169, lng: 121.4627, dist: '板橋區', country: '台灣' },
      台中市: { lat: 24.1477, lng: 120.6736, dist: '中區', country: '台灣' },
      桃園市: { lat: 24.9936, lng: 121.3009, dist: '桃園區', country: '台灣' },
      嘉義市: { lat: 23.48, lng: 120.4491, dist: '東區', country: '台灣' },
      屏東縣: { lat: 22.6762, lng: 120.4885, dist: '屏東市', country: '台灣' },
      宜蘭縣: { lat: 24.757, lng: 121.753, dist: '宜蘭市', country: '台灣' },
      花蓮縣: { lat: 23.9772, lng: 121.6044, dist: '花蓮市', country: '台灣' },
      台東縣: { lat: 22.756, lng: 121.1444, dist: '台東市', country: '台灣' },
      東京都: { lat: 35.7118, lng: 139.7965, dist: '台東區', country: '日本' },
      京都府: { lat: 35.0037, lng: 135.768, dist: '中京區', country: '日本' },
      大阪府: { lat: 34.6937, lng: 135.5023, dist: '中央區', country: '日本' },
    };

    for (let i = 0; i < extractedCandidates.length; i++) {
      const cand = extractedCandidates[i];

      // Ensure store name does NOT contain address
      const sepCand = separateNameAndAddress(cand.name);
      if (sepCand.foundAddress) {
        cand.name = sepCand.cleanName;
        if (!cand.addressHint) cand.addressHint = sepCand.foundAddress;
      }

      // Detect city and district strictly from address, candidate name, coordinates, and rawInput
      const fullLocationString = [
        urlDetectedAddress,
        cand.addressHint,
        cand.name,
        rawInput,
      ]
        .filter(Boolean)
        .join(' ');

      // Check if an explicit city was detected from the text or coordinates (without fallback)
      const explicitRegion = extractRegionFromAddress(
        fullLocationString,
        urlDetectedCoords,
        ''
      );
      const region = extractRegionFromAddress(
        fullLocationString,
        urlDetectedCoords,
        defaultCity || '台南市'
      );

      let placeId = `custom_${cand.name.replace(/\s+/g, '_').toLowerCase()}`;
      let formattedAddress =
        urlDetectedAddress ||
        (cand.addressHint
          ? cand.addressHint
          : `${region.country}${region.city}${region.district}${cand.name}`);

      const fallbackCoords = getCoordinatesForRegion(
        region.city,
        region.district,
        `${cand.name}-${i}`
      );
      let lat = urlDetectedCoords?.lat ?? fallbackCoords.lat;
      let lng = urlDetectedCoords?.lng ?? fallbackCoords.lng;
      let hasExactCoords = Boolean(urlDetectedCoords);
      let rating: number | null = 4.5;
      let weekdayDescriptions = ['每日 10:00–21:00'];
      let dailyHours = { open: '10:00', close: '21:00' };

      if (googleMapsApiKey && googleMapsApiKey !== 'your-google-maps-api-key') {
        try {
          const searchCityHint =
            explicitRegion.city || rawDefaultCity || '台灣';
          const searchQuery =
            cand.addressHint && !cand.name.includes(cand.addressHint)
              ? `${cand.name} ${cand.addressHint}`
              : urlDetectedCoords
              ? cand.name
              : `${cand.name} ${searchCityHint}`;

          const requestBody: Record<string, unknown> = {
            textQuery: searchQuery,
            languageCode: 'zh-TW',
          };
          if (urlDetectedCoords) {
            requestBody.locationBias = {
              circle: {
                center: {
                  latitude: urlDetectedCoords.lat,
                  longitude: urlDetectedCoords.lng,
                },
                radius: 1500.0,
              },
            };
          }

          const placesRes = await fetch(
            'https://places.googleapis.com/v1/places:searchText',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': googleMapsApiKey,
                'X-Goog-FieldMask':
                  'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.regularOpeningHours,places.googleMapsUri,places.businessStatus,places.editorialSummary',
              },
              body: JSON.stringify(requestBody),
              signal: AbortSignal.timeout(5000),
            }
          );
          if (placesRes.ok) {
            const placesData = await placesRes.json();
            const top = placesData.places?.[0];
            if (top) {
              placeId = top.id || placeId;
              if (top.displayName?.text) {
                cand.name = top.displayName.text;
              }
              if (top.location?.latitude && top.location?.longitude) {
                lat = top.location.latitude;
                lng = top.location.longitude;
                hasExactCoords = true;
              }
              if (top.formattedAddress) {
                formattedAddress = top.formattedAddress;
                const officialRegion = extractRegionFromAddress(
                  top.formattedAddress,
                  hasExactCoords ? { lat, lng } : null,
                  region.city
                );
                region.city = officialRegion.city;
                region.district = officialRegion.district;
                region.country = officialRegion.country;
              }
              if (top.editorialSummary?.text) {
                cand.user_notes = top.editorialSummary.text;
              }
              rating = top.rating ?? rating;
              if (top.regularOpeningHours?.weekdayDescriptions) {
                weekdayDescriptions =
                  top.regularOpeningHours.weekdayDescriptions;
              }
            }
          }
        } catch (err) {
          console.warn('Google Places API lookup fallback:', err);
        }
      }

      // Zero-API-key open web address extraction fallback when coordinates/address are missing
      if (
        (!googleMapsApiKey || googleMapsApiKey === 'your-google-maps-api-key') &&
        !hasExactCoords &&
        (!formattedAddress ||
          formattedAddress.includes('市中心') ||
          !/[路街段巷弄號]/.test(formattedAddress))
      ) {
        try {
          const ddgRes = await fetch(
            `https://html.duckduckgo.com/html/?q=${encodeURIComponent(
              cand.name + ' 地址'
            )}`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              },
              signal: AbortSignal.timeout(2000),
            }
          );
          if (ddgRes.ok) {
            const html = await ddgRes.text();
            const addrMatch = html.match(
              /(?:(?:\d{3})\s*)?(?:台灣|臺灣)?\s*(?:台北市|臺北市|新北市|桃園市|台中市|臺中市|台南市|臺南市|高雄市|基隆市|新竹[市縣]|苗栗縣|彰化縣|南投縣|雲林縣|嘉義[市縣]|屏東縣|宜蘭縣|花蓮縣|台東縣|臺東縣)[^\s,，。、<>\":：]{1,4}[區市鎮鄉][^\s,，。、<>\":：]{1,15}(?:路|街|大道)(?:[一二三四五六七八九十\d]+段)?(?:[0-9]+巷)?(?:[0-9]+弄)?[0-9]+(?:[之\-][0-9]+)?號/
            );
            if (addrMatch) {
              formattedAddress = addrMatch[0].trim();
              const searchedRegion = extractRegionFromAddress(formattedAddress);
              region.city = searchedRegion.city;
              region.district = searchedRegion.district;
              region.country = searchedRegion.country;
              const newCoords = getCoordinatesForRegion(
                region.city,
                region.district,
                cand.name
              );
              lat = newCoords.lat;
              lng = newCoords.lng;
            }
          }
        } catch {
          // ignore network timeout in serverless
        }
      }

      // Final guard: guarantee cand.name never contains any street/village/city address prefix
      const finalSep = separateNameAndAddress(cand.name);
      if (finalSep.foundAddress && finalSep.cleanName) {
        cand.name = finalSep.cleanName;
        if (
          !formattedAddress ||
          formattedAddress.includes('市中心') ||
          formattedAddress.length < finalSep.foundAddress.length
        ) {
          formattedAddress = finalSep.foundAddress;
        }
      }
      const finalRegion = extractRegionFromAddress(
        `${formattedAddress} ${cand.addressHint || ''} ${rawInput}`,
        hasExactCoords ? { lat, lng } : null,
        region.city
      );
      region.city = finalRegion.city;
      region.district = finalRegion.district;
      region.country = finalRegion.country;

      // If we have exact coordinates (from S2CellId in URL or Google Places API), verify official Taiwan district polygon via BigDataCloud if address omitted explicit district
      if (
        hasExactCoords &&
        region.country === '台灣' &&
        !/^\d{3}/.test(formattedAddress)
      ) {
        try {
          const bdcRes = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=zh`,
            { signal: AbortSignal.timeout(2000) }
          );
          if (bdcRes.ok) {
            const bdc = await bdcRes.json();
            const bdcCity = String(
              bdc.principalSubdivision || bdc.city || ''
            )
              .replace('臺', '台')
              .trim();
            const bdcDist = String(bdc.locality || '').trim();
            if (bdcCity && /[市縣]$/.test(bdcCity)) {
              region.city = bdcCity;
            }
            if (bdcDist && /[區市鎮鄉]$/.test(bdcDist)) {
              region.district = bdcDist;
            }
          }
        } catch {
          // fallback to local centroid/postal code resolution
        }
      }

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
        user_notes:
          cand.user_notes &&
          cand.user_notes !== '透過智慧快速輸入新增' &&
          cand.user_notes !== '由 CSV 清單匯入' &&
          cand.user_notes !== '由 Google Takeout 匯入'
            ? cand.user_notes
            : resolvePlaceDescription(
                cand.name,
                region.city,
                region.district,
                cand.sub_category,
                formattedAddress
              ),
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
