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

const TW_SUB_TOKEN_PATTERN =
  '(?:' +
  '(?:(?<!夜|超|門|菜|魚|花|古|早|牛|果)[^\\d\\s,，。、]{1,3}[區鎮鄉市](?![場集民街路]))|' +
  '(?:[^\\d\\s,，。、]{1,6}?(?:[一二三四五六七八九十\\d]+段)?(?:\\d+巷)?(?:\\d+弄)?\\d+(?:[之\\-]\\d+)?號(?:之\\d+)?(?:\\d+[樓Ff])?)|' +
  '(?:[^\\d\\s,，。、]{1,3}[里村](?:\\d+鄰)?(?:[^\\d\\s,，。、]{2,4}(?:大道|路|街)(?:[一二三四五六七八九十\\d]+段)?(?!\\d|[一二三四五六七八九十]+段))?)|' +
  '(?:\\d+鄰)|' +
  '(?:[^\\d\\s,，。、]{2,4}大道(?:[一二三四五六七八九十\\d]+段)?(?!\\d))|' +
  '(?:\\d+巷)|' +
  '(?:\\d+弄)|' +
  '(?:\\d+[樓Ff])' +
  ')';

const TAIWAN_ADDR_REGEX = new RegExp(
  '(?:(?:台灣|臺灣)\\s*)?' +
  '(?:\\d{3,5}\\s*)?' +
  '(?:' +
  TAIWAN_CITIES.join('|') +
  ')' +
  TW_SUB_TOKEN_PATTERN +
  '+'
);

const JAPAN_ADDR_REGEX =
  /(?:日本)?(?:東京都|大阪府|京都府|北海道|[^\s,]+?[都道府県])(?:[^\s,都道府県]+?[区區市町村])(?:[^\s,]+?[0-9\-丁目番地号號]+)/;

// Known road/village/landmark to District hints when Google Maps omits District
const LANDMARK_OR_ROAD_TO_DISTRICT: Array<{
  keywords: string[];
  city: string;
  district: string;
}> = [
  {
    keywords: [
      '永華里',
      '兌悅里',
      '赤嵌里',
      '南美里',
      '小西門',
      '湯德章大道',
      '臺灣文學館',
      '台灣文學館',
      '林百貨',
      '赤崁樓',
      '神農街',
      '國華街',
      '保安路',
      '海安路一段',
      '海安路二段',
      '海安路',
      '友愛街',
      '正興街',
      '民族路二段',
      '民族路三段',
      '民生路一段',
      '民生路二段',
      '府前路',
      '西門路二段',
      '忠義路二段',
      '忠義路',
      '永福路',
      '中正路1號',
      '金華路三段',
      '金華路四段',
      '新美街',
      '信義街',
      '城隍街',
      '開山路',
      '南門路',
      '青年路',
      '衛民街',
      '萬昌街',
      '康樂街',
      '尊王路',
      '大智街',
      '府中街',
      '清珍鴨肉焿',
      '梅鑫海產',
      'SabiSabi',
      '赫玖',
      '和意路',
      '和意街',
      '德記古早味汕頭豆花',
      '西市場',
      '大菜市',
      '西門市場',
    ],
    city: '台南市',
    district: '中西區',
  },
  {
    keywords: [
      '崇安街',
      '北華里',
      '花園夜市',
      '海安路三段',
      '公園路',
      '公園南路',
      '成功路',
      '北門路二段',
      '開元路',
      '長榮路四段',
      '長榮路五段',
      '小東路',
      '西門路三段',
      '西門路四段',
      '和緯路',
      '育成路',
      '連得堂',
      '鴨母寮',
    ],
    city: '台南市',
    district: '北區',
  },
  {
    keywords: [
      '大學路',
      '育樂街',
      '勝利路',
      '長榮路一段',
      '長榮路二段',
      '長榮路三段',
      '東門路',
      '東寧路',
      '崇學路',
      '崇明路',
      '崇德路',
      '崇善路',
      '中華東路',
      '林森路一段',
      '林森路二段',
      '裕農路',
      '南紡',
    ],
    city: '台南市',
    district: '東區',
  },
  {
    keywords: [
      '水交社',
      '夏林路',
      '金華路一段',
      '金華路二段',
      '西門路一段',
      '健康路一段',
      '健康路二段',
      '大同路二段',
      '新興路',
      '明興路',
      '灣裡',
      '喜樹',
      '新昌里',
      '酣呷',
      'The Han-Jia',
      'The Han Jia',
      '下林米糕',
      '下林',
      '阿銘牛肉麵',
      '藍晒圖',
      '新光三越新天地',
      '新光三越台南新天地',
    ],
    city: '台南市',
    district: '南區',
  },
  {
    keywords: [
      '安平古堡',
      '安平老街',
      '安平樹屋',
      '億載金城',
      '安平路',
      '安北路',
      '古堡街',
      '漁光島',
      '永華路二段',
      '慶平路',
      '平通路',
      '健康三街',
      '國平路',
      '華平路',
      '怡平路',
    ],
    city: '台南市',
    district: '安平區',
  },
  {
    keywords: [
      '中華路',
      '中正南路',
      '中正北路',
      '大橋',
      '東橋',
      '大灣路',
      '永大路',
      '崑山',
      '復國一路',
      '勝學路',
    ],
    city: '台南市',
    district: '永康區',
  },
  {
    keywords: ['奇美博物館', '十鼓文創', '虎山里', '文華路二段', '阿財辦桌'],
    city: '台南市',
    district: '仁德區',
  },
  {
    keywords: [
      '總爺藝文中心',
      '總爺糖廠',
      '總爺',
      '麻豆總爺',
      '麻豆代天府',
      '南勢里總爺',
      '總爺國小',
    ],
    city: '台南市',
    district: '麻豆區',
  },
  {
    keywords: ['駁二', '大義街', '大勇路', '新樂街', '五福四路', '大成街', '七賢三路'],
    city: '高雄市',
    district: '鹽埕區',
  },
  {
    keywords: ['西子灣', '哈瑪星', '馬卡道路', '內惟藝術中心', '美術館路', '哨船頭'],
    city: '高雄市',
    district: '鼓山區',
  },
  // 台北市各行政區路名、捷運站與地標
  {
    keywords: [
      '民生東路一段',
      '民生東路二段',
      '民生東路三段',
      '某咖啡',
      'Mau Coffee',
      "ED's Diner",
      '樂群二路',
      '樂群三路',
      '敬業三路',
      '大直',
      '松江路',
      '南京東路一段',
      '南京東路二段',
      '南京東路三段',
      '林森北路',
      '中山北路一段',
      '中山北路二段',
      '中山北路三段',
      '長安東路',
      '農安街',
      '雙城街',
      '行天宮',
      '松江南京',
      '中山國中',
      '劍南路',
      '晴光市場',
      '條通',
    ],
    city: '台北市',
    district: '中山區',
  },
  {
    keywords: [
      '信義安和',
      'The Slice Shop',
      '元意餐廳',
      '安和路',
      '敦化南路',
      '仁愛路三段',
      '仁愛路四段',
      '忠孝東路三段',
      '忠孝東路四段',
      '大安路',
      '延吉街',
      '光復南路',
      '永康街',
      '金華街',
      '麗水街',
      '潮州街',
      '和平東路',
      '新生南路',
      '羅斯福路三段',
      '師大',
      '公館',
      '東門',
      '科技大樓',
      '六張犁',
      '通化街',
      '臨江街',
      '大安森林公園',
    ],
    city: '台北市',
    district: '大安區',
  },
  {
    keywords: [
      '碧山巖',
      '碧山路',
      '白石湖',
      '大湖公園',
      '內湖路',
      '瑞光路',
      '成功路',
      '民權東路六段',
      '康寧路',
      '東湖',
      '西湖',
      '港墘',
      '文德',
      '葫洲',
      '金面山',
    ],
    city: '台北市',
    district: '內湖區',
  },
  {
    keywords: [
      '台北101',
      '世貿',
      '象山',
      '信義路五段',
      '松壽路',
      '松智路',
      '松仁路',
      '松高路',
      '忠孝東路五段',
      '基隆路一段',
      '永吉路',
      '吳興街',
      '四四南村',
      '市政府',
      '永春',
      '後山埤',
    ],
    city: '台北市',
    district: '信義區',
  },
  {
    keywords: [
      '民生東路四段',
      '民生東路五段',
      '民生社區',
      '富錦街',
      '新中街',
      '延壽街',
      '三民路',
      '南京東路四段',
      '南京東路五段',
      '敦化北路',
      '八德路三段',
      '八德路四段',
      '饒河街',
      '松山車站',
      '小巨蛋',
      '南京三民',
    ],
    city: '台北市',
    district: '松山區',
  },
  {
    keywords: [
      '迪化街',
      '大稻埕',
      '寧夏夜市',
      '赤峰街',
      '承德路',
      '重慶北路',
      '延平北路',
      '民權西路',
      '大橋頭',
      '雙連',
      '圓山',
      '霞海城隍廟',
    ],
    city: '台北市',
    district: '大同區',
  },
  {
    keywords: [
      '台北車站',
      '華山1914',
      '中正紀念堂',
      '南門市場',
      '羅斯福路一段',
      '羅斯福路二段',
      '忠孝西路',
      '忠孝東路一段',
      '忠孝東路二段',
      '北平東路',
      '濟南路',
      '青島東路',
      '善導寺',
      '古亭',
      '公館商圈',
    ],
    city: '台北市',
    district: '中正區',
  },
  {
    keywords: [
      '西門町',
      '龍山寺',
      '剝皮寮',
      '華西街',
      '萬華',
      '成都路',
      '漢中街',
      '武昌街',
      '中華路',
      '艋舺',
    ],
    city: '台北市',
    district: '萬華區',
  },
  {
    keywords: [
      '士林夜市',
      '故宮',
      '天母',
      '陽明山',
      '芝山',
      '劍潭',
      '忠誠路',
      '中山北路五段',
      '中山北路六段',
      '中山北路七段',
      '文林路',
    ],
    city: '台北市',
    district: '士林區',
  },
  {
    keywords: [
      '北投溫泉',
      '新北投',
      '石牌',
      '明德',
      '奇岩',
      '唭哩岸',
      '關渡',
      '硫磺谷',
      '地熱谷',
    ],
    city: '台北市',
    district: '北投區',
  },
  {
    keywords: ['南港展覽館', '南港車站', '昆陽', '後山埤', '研究院路', '市民大道八段'],
    city: '台北市',
    district: '南港區',
  },
  {
    keywords: ['貓空', '木柵', '動物園', '景美', '萬隆', '政大', '指南路'],
    city: '台北市',
    district: '文山區',
  },
  {
    keywords: ['鳥苑', 'Torien Yakitori', '勤美', '草悟道', '審計新村', '忠明南路', '公益路', '向上路', '美村路'],
    city: '台中市',
    district: '西區',
  },
];

// District centroids for coordinate-based district fallback
/**
 * Decode a 64-bit Google Maps S2CellId hex string (e.g. "0x346e7668cf15971f" or "0x3442abb6da9c9e1f")
 * directly into WGS84 { lat, lng } coordinates offline.
 */
export function s2CellIdToLatLng(
  hexStr: string
): { lat: number; lng: number } | null {
  try {
    const cleanHex = hexStr.trim().toLowerCase();
    if (!/^0x[0-9a-f]{15,16}$/.test(cleanHex)) return null;
    const id = BigInt(cleanHex);
    if (id === BigInt(0)) return null;
    const face = Number(id >> BigInt(61));
    if (face < 0 || face > 5) return null;

    const kSwapMask = 0x01;
    const kInvertMask = 0x02;
    const kPosToOrientation = [kSwapMask, 0, 0, kInvertMask | kSwapMask];
    const kPosToIJ = [
      [0, 1, 3, 2],
      [0, 2, 3, 1],
      [3, 2, 0, 1],
      [3, 1, 0, 2],
    ];

    let i = 0;
    let j = 0;
    let orientation = face & kSwapMask;
    for (let k = 29; k >= 0; k--) {
      const pos = Number((id >> BigInt(2 * k + 1)) & BigInt(3));
      const ij = kPosToIJ[orientation][pos];
      i = (i << 1) | (ij >> 1);
      j = (j << 1) | (ij & 1);
      orientation ^= kPosToOrientation[pos];
    }

    const stToUV = (s: number) => {
      if (s >= 0.5) return (1 / 3) * (4 * s * s - 1);
      return (1 / 3) * (1 - 4 * (1 - s) * (1 - s));
    };

    const s = (i + 0.5) / 1073741824; // 2^30
    const t = (j + 0.5) / 1073741824;
    const u = stToUV(s);
    const v = stToUV(t);

    let x = 0;
    let y = 0;
    let z = 0;
    switch (face) {
      case 0:
        x = 1;
        y = u;
        z = v;
        break;
      case 1:
        x = -u;
        y = 1;
        z = v;
        break;
      case 2:
        x = -u;
        y = -v;
        z = 1;
        break;
      case 3:
        x = -1;
        y = -v;
        z = -u;
        break;
      case 4:
        x = v;
        y = -1;
        z = -u;
        break;
      default:
        x = v;
        y = u;
        z = -1;
        break;
    }

    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * (180 / Math.PI);
    const lng = Math.atan2(y, x) * (180 / Math.PI);
    if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180) {
      return null;
    }
    return {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
    };
  } catch {
    return null;
  }
}

/**
 * Extract coordinates from any Google Maps URL or text (supports !1s0x...:0x... S2CellId in Takeout CSV URLs,
 * !3d<lat>!4d<lng>, @<lat>,<lng>, and /search/<lat>,<lng>)
 */
export function extractCoordsFromGoogleMapsUrl(
  textOrUrl: string
): { lat: number; lng: number } | null {
  if (!textOrUrl) return null;
  let str = textOrUrl;
  try {
    str = decodeURIComponent(textOrUrl);
  } catch {}

  // 1. Exact pin !3d<lat>!4d<lng>
  const pinMatch = str.match(/!3d([0-9.-]+)!4d([0-9.-]+)/);
  if (pinMatch) {
    const lat = parseFloat(pinMatch[1]);
    const lng = parseFloat(pinMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 85) {
      return { lat, lng };
    }
  }

  // 2. S2CellId in Google Takeout / Google Maps FTID (!1s0x34...:0x... or 0x34...:0x...)
  const s2Match = str.match(/(?:!1s|^|[^0-9a-f])(0x[0-9a-f]{15,16}):0x[0-9a-f]+/i);
  if (s2Match) {
    const decoded = s2CellIdToLatLng(s2Match[1]);
    if (decoded) return decoded;
  }

  // 3. @<lat>,<lng>
  const atMatch = str.match(/@([0-9.-]+),([0-9.-]+)/);
  if (atMatch) {
    const lat = parseFloat(atMatch[1]);
    const lng = parseFloat(atMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 85) {
      return { lat, lng };
    }
  }

  // 4. /search/<lat>,<lng>
  const searchMatch = str.match(/\/search\/([0-9]{2}\.[0-9]+),\s*([0-9]{2,3}\.[0-9]+)/);
  if (searchMatch) {
    const lat = parseFloat(searchMatch[1]);
    const lng = parseFloat(searchMatch[2]);
    if (!isNaN(lat) && !isNaN(lng)) {
      return { lat, lng };
    }
  }

  // 5. ?q=<lat>,<lng>, &query=<lat>,<lng>, or ?ll=<lat>,<lng>
  const qCoordMatch = str.match(
    /[?&](?:q|query|ll)=(?:loc:)?([0-9.-]+)[,\s]+([0-9.-]+)/
  );
  if (qCoordMatch) {
    const lat = parseFloat(qCoordMatch[1]);
    const lng = parseFloat(qCoordMatch[2]);
    if (!isNaN(lat) && !isNaN(lng) && Math.abs(lat) <= 85) {
      return { lat, lng };
    }
  }

  return null;
}

/**
 * Extracts pure place/store name from any Google Maps URL.
 */
export function extractPlaceNameFromGoogleMapsUrl(url: string): string {
  if (!url) return '';
  let str = url;
  try {
    str = decodeURIComponent(url);
  } catch {}

  // 1. /maps/place/<name>
  const placeMatch = str.match(/\/maps\/place\/([^/?#@]+)/);
  if (placeMatch) {
    const raw = placeMatch[1].replace(/\+/g, ' ').trim();
    if (
      raw &&
      !/^0x[0-9a-f]+:0x[0-9a-f]+/i.test(raw) &&
      !/^[0-9.-]+,\s*[0-9.-]+$/.test(raw)
    ) {
      return raw;
    }
  }

  // 2. /maps/search/<name>
  const searchMatch = str.match(/\/maps\/search\/([^/?#@]+)/);
  if (searchMatch) {
    const raw = searchMatch[1].replace(/\+/g, ' ').trim();
    if (
      raw &&
      !/^0x[0-9a-f]+:0x[0-9a-f]+/i.test(raw) &&
      !/^[0-9.-]+,\s*[0-9.-]+$/.test(raw)
    ) {
      return raw;
    }
  }

  // 3. ?q=<name> or ?query=<name>
  const qMatch = str.match(/[?&](?:query|q)=([^&#]+)/);
  if (qMatch) {
    const raw = qMatch[1].replace(/\+/g, ' ').trim();
    if (
      raw &&
      !/^0x[0-9a-f]+:0x[0-9a-f]+/i.test(raw) &&
      !/^[0-9.-]+,\s*[0-9.-]+$/.test(raw)
    ) {
      return raw;
    }
  }

  return '';
}

/**
 * Complete Taiwan 3-digit Postal Code (郵遞區號) to (City, District) lookup.
 * Google Places API often formats Taiwan addresses as "700台灣台南市金華路四段93號" (omitting "中西區"),
 * where the leading 3-digit postal code ("700") uniquely identifies the district!
 */
export const TAIWAN_ZIP_TO_REGION: Record<
  string,
  { city: string; district: string }
> = {
  // 台北市
  '100': { city: '台北市', district: '中正區' },
  '103': { city: '台北市', district: '大同區' },
  '104': { city: '台北市', district: '中山區' },
  '105': { city: '台北市', district: '松山區' },
  '106': { city: '台北市', district: '大安區' },
  '108': { city: '台北市', district: '萬華區' },
  '110': { city: '台北市', district: '信義區' },
  '111': { city: '台北市', district: '士林區' },
  '112': { city: '台北市', district: '北投區' },
  '114': { city: '台北市', district: '內湖區' },
  '115': { city: '台北市', district: '南港區' },
  '116': { city: '台北市', district: '文山區' },
  // 基隆市
  '200': { city: '基隆市', district: '仁愛區' },
  '201': { city: '基隆市', district: '信義區' },
  '202': { city: '基隆市', district: '中正區' },
  '203': { city: '基隆市', district: '中山區' },
  '204': { city: '基隆市', district: '安樂區' },
  '205': { city: '基隆市', district: '暖暖區' },
  '206': { city: '基隆市', district: '七堵區' },
  // 新北市
  '207': { city: '新北市', district: '萬里區' },
  '208': { city: '新北市', district: '金山區' },
  '220': { city: '新北市', district: '板橋區' },
  '221': { city: '新北市', district: '汐止區' },
  '222': { city: '新北市', district: '深坑區' },
  '223': { city: '新北市', district: '石碇區' },
  '224': { city: '新北市', district: '瑞芳區' },
  '226': { city: '新北市', district: '平溪區' },
  '227': { city: '新北市', district: '雙溪區' },
  '228': { city: '新北市', district: '貢寮區' },
  '231': { city: '新北市', district: '新店區' },
  '232': { city: '新北市', district: '坪林區' },
  '233': { city: '新北市', district: '烏來區' },
  '234': { city: '新北市', district: '永和區' },
  '235': { city: '新北市', district: '中和區' },
  '236': { city: '新北市', district: '土城區' },
  '237': { city: '新北市', district: '三峽區' },
  '238': { city: '新北市', district: '樹林區' },
  '239': { city: '新北市', district: '鶯歌區' },
  '241': { city: '新北市', district: '三重區' },
  '242': { city: '新北市', district: '新莊區' },
  '243': { city: '新北市', district: '泰山區' },
  '244': { city: '新北市', district: '林口區' },
  '247': { city: '新北市', district: '蘆洲區' },
  '248': { city: '新北市', district: '五股區' },
  '249': { city: '新北市', district: '八里區' },
  '251': { city: '新北市', district: '淡水區' },
  '252': { city: '新北市', district: '三芝區' },
  '253': { city: '新北市', district: '石門區' },
  // 宜蘭縣
  '260': { city: '宜蘭縣', district: '宜蘭市' },
  '261': { city: '宜蘭縣', district: '頭城鎮' },
  '262': { city: '宜蘭縣', district: '礁溪鄉' },
  '263': { city: '宜蘭縣', district: '壯圍鄉' },
  '264': { city: '宜蘭縣', district: '員山鄉' },
  '265': { city: '宜蘭縣', district: '羅東鎮' },
  '266': { city: '宜蘭縣', district: '三星鄉' },
  '267': { city: '宜蘭縣', district: '大同鄉' },
  '268': { city: '宜蘭縣', district: '五結鄉' },
  '269': { city: '宜蘭縣', district: '冬山鄉' },
  '270': { city: '宜蘭縣', district: '蘇澳鎮' },
  '272': { city: '宜蘭縣', district: '南澳鄉' },
  // 新竹市/縣
  '300': { city: '新竹市', district: '東區' },
  '302': { city: '新竹縣', district: '竹北市' },
  '303': { city: '新竹縣', district: '湖口鄉' },
  '304': { city: '新竹縣', district: '新豐鄉' },
  '305': { city: '新竹縣', district: '新埔鎮' },
  '306': { city: '新竹縣', district: '關西鎮' },
  '307': { city: '新竹縣', district: '芎林鄉' },
  '308': { city: '新竹縣', district: '寶山鄉' },
  '310': { city: '新竹縣', district: '竹東鎮' },
  '311': { city: '新竹縣', district: '五峰鄉' },
  '312': { city: '新竹縣', district: '橫山鄉' },
  '313': { city: '新竹縣', district: '尖石鄉' },
  '314': { city: '新竹縣', district: '北埔鄉' },
  '315': { city: '新竹縣', district: '峨眉鄉' },
  // 桃園市
  '320': { city: '桃園市', district: '中壢區' },
  '324': { city: '桃園市', district: '平鎮區' },
  '325': { city: '桃園市', district: '龍潭區' },
  '326': { city: '桃園市', district: '楊梅區' },
  '327': { city: '桃園市', district: '新屋區' },
  '328': { city: '桃園市', district: '觀音區' },
  '330': { city: '桃園市', district: '桃園區' },
  '333': { city: '桃園市', district: '龜山區' },
  '334': { city: '桃園市', district: '八德區' },
  '335': { city: '桃園市', district: '大溪區' },
  '336': { city: '桃園市', district: '復興區' },
  '337': { city: '桃園市', district: '大園區' },
  '338': { city: '桃園市', district: '蘆竹區' },
  // 苗栗縣
  '350': { city: '苗栗縣', district: '竹南鎮' },
  '351': { city: '苗栗縣', district: '頭份市' },
  '352': { city: '苗栗縣', district: '三灣鄉' },
  '353': { city: '苗栗縣', district: '南庄鄉' },
  '357': { city: '苗栗縣', district: '通霄鎮' },
  '358': { city: '苗栗縣', district: '苑裡鎮' },
  '360': { city: '苗栗縣', district: '苗栗市' },
  '363': { city: '苗栗縣', district: '公館鄉' },
  '364': { city: '苗栗縣', district: '大湖鄉' },
  '366': { city: '苗栗縣', district: '銅鑼鄉' },
  '367': { city: '苗栗縣', district: '三義鄉' },
  // 台中市
  '400': { city: '台中市', district: '中區' },
  '401': { city: '台中市', district: '東區' },
  '402': { city: '台中市', district: '南區' },
  '403': { city: '台中市', district: '西區' },
  '404': { city: '台中市', district: '北區' },
  '406': { city: '台中市', district: '北屯區' },
  '407': { city: '台中市', district: '西屯區' },
  '408': { city: '台中市', district: '南屯區' },
  '411': { city: '台中市', district: '太平區' },
  '412': { city: '台中市', district: '大里區' },
  '413': { city: '台中市', district: '霧峰區' },
  '414': { city: '台中市', district: '烏日區' },
  '420': { city: '台中市', district: '豐原區' },
  '421': { city: '台中市', district: '后里區' },
  '422': { city: '台中市', district: '石岡區' },
  '423': { city: '台中市', district: '東勢區' },
  '424': { city: '台中市', district: '和平區' },
  '426': { city: '台中市', district: '新社區' },
  '427': { city: '台中市', district: '潭子區' },
  '428': { city: '台中市', district: '大雅區' },
  '429': { city: '台中市', district: '神岡區' },
  '432': { city: '台中市', district: '大肚區' },
  '433': { city: '台中市', district: '沙鹿區' },
  '434': { city: '台中市', district: '龍井區' },
  '435': { city: '台中市', district: '梧棲區' },
  '436': { city: '台中市', district: '清水區' },
  '437': { city: '台中市', district: '大甲區' },
  // 彰化縣
  '500': { city: '彰化縣', district: '彰化市' },
  '505': { city: '彰化縣', district: '鹿港鎮' },
  '510': { city: '彰化縣', district: '員林市' },
  // 南投縣
  '540': { city: '南投縣', district: '南投市' },
  '542': { city: '南投縣', district: '草屯鎮' },
  '545': { city: '南投縣', district: '埔里鎮' },
  '546': { city: '南投縣', district: '仁愛鄉' },
  '555': { city: '南投縣', district: '魚池鄉' },
  '557': { city: '南投縣', district: '竹山鎮' },
  '558': { city: '南投縣', district: '鹿谷鄉' },
  // 嘉義市/縣
  '600': { city: '嘉義市', district: '東區' },
  '602': { city: '嘉義縣', district: '番路鄉' },
  '603': { city: '嘉義縣', district: '梅山鄉' },
  '604': { city: '嘉義縣', district: '竹崎鄉' },
  '605': { city: '嘉義縣', district: '阿里山鄉' },
  '612': { city: '嘉義縣', district: '太保市' },
  '613': { city: '嘉義縣', district: '朴子市' },
  '621': { city: '嘉義縣', district: '民雄鄉' },
  // 雲林縣
  '630': { city: '雲林縣', district: '斗南鎮' },
  '632': { city: '雲林縣', district: '虎尾鎮' },
  '640': { city: '雲林縣', district: '斗六市' },
  '651': { city: '雲林縣', district: '北港鎮' },
  // 台南市 (37區)
  '700': { city: '台南市', district: '中西區' },
  '701': { city: '台南市', district: '東區' },
  '702': { city: '台南市', district: '南區' },
  '704': { city: '台南市', district: '北區' },
  '708': { city: '台南市', district: '安平區' },
  '709': { city: '台南市', district: '安南區' },
  '710': { city: '台南市', district: '永康區' },
  '711': { city: '台南市', district: '歸仁區' },
  '712': { city: '台南市', district: '新化區' },
  '713': { city: '台南市', district: '左鎮區' },
  '714': { city: '台南市', district: '玉井區' },
  '715': { city: '台南市', district: '楠西區' },
  '716': { city: '台南市', district: '南化區' },
  '717': { city: '台南市', district: '仁德區' },
  '718': { city: '台南市', district: '關廟區' },
  '719': { city: '台南市', district: '龍崎區' },
  '720': { city: '台南市', district: '官田區' },
  '721': { city: '台南市', district: '麻豆區' },
  '722': { city: '台南市', district: '佳里區' },
  '723': { city: '台南市', district: '西港區' },
  '724': { city: '台南市', district: '七股區' },
  '725': { city: '台南市', district: '將軍區' },
  '726': { city: '台南市', district: '學甲區' },
  '727': { city: '台南市', district: '北門區' },
  '730': { city: '台南市', district: '新營區' },
  '731': { city: '台南市', district: '後壁區' },
  '732': { city: '台南市', district: '白河區' },
  '733': { city: '台南市', district: '東山區' },
  '734': { city: '台南市', district: '六甲區' },
  '735': { city: '台南市', district: '下營區' },
  '736': { city: '台南市', district: '柳營區' },
  '737': { city: '台南市', district: '鹽水區' },
  '741': { city: '台南市', district: '善化區' },
  '742': { city: '台南市', district: '大內區' },
  '743': { city: '台南市', district: '山上區' },
  '744': { city: '台南市', district: '新市區' },
  '745': { city: '台南市', district: '安定區' },
  // 高雄市 (38區)
  '800': { city: '高雄市', district: '新興區' },
  '801': { city: '高雄市', district: '前金區' },
  '802': { city: '高雄市', district: '苓雅區' },
  '803': { city: '高雄市', district: '鹽埕區' },
  '804': { city: '高雄市', district: '鼓山區' },
  '805': { city: '高雄市', district: '旗津區' },
  '806': { city: '高雄市', district: '前鎮區' },
  '807': { city: '高雄市', district: '三民區' },
  '811': { city: '高雄市', district: '楠梓區' },
  '812': { city: '高雄市', district: '小港區' },
  '813': { city: '高雄市', district: '左營區' },
  '814': { city: '高雄市', district: '仁武區' },
  '815': { city: '高雄市', district: '大社區' },
  '820': { city: '高雄市', district: '岡山區' },
  '821': { city: '高雄市', district: '路竹區' },
  '822': { city: '高雄市', district: '阿蓮區' },
  '823': { city: '高雄市', district: '田寮區' },
  '824': { city: '高雄市', district: '燕巢區' },
  '825': { city: '高雄市', district: '橋頭區' },
  '826': { city: '高雄市', district: '梓官區' },
  '827': { city: '高雄市', district: '彌陀區' },
  '828': { city: '高雄市', district: '永安區' },
  '829': { city: '高雄市', district: '湖內區' },
  '830': { city: '高雄市', district: '鳳山區' },
  '831': { city: '高雄市', district: '大寮區' },
  '832': { city: '高雄市', district: '林園區' },
  '833': { city: '高雄市', district: '鳥松區' },
  '840': { city: '高雄市', district: '大樹區' },
  '842': { city: '高雄市', district: '旗山區' },
  '843': { city: '高雄市', district: '美濃區' },
  '844': { city: '高雄市', district: '六龜區' },
  '845': { city: '高雄市', district: '內門區' },
  '846': { city: '高雄市', district: '杉林區' },
  '847': { city: '高雄市', district: '甲仙區' },
  // 澎湖 / 金門
  '880': { city: '澎湖縣', district: '馬公市' },
  '893': { city: '金門縣', district: '金城鎮' },
  // 屏東縣
  '900': { city: '屏東縣', district: '屏東市' },
  '912': { city: '屏東縣', district: '內埔鄉' },
  '920': { city: '屏東縣', district: '潮州鎮' },
  '928': { city: '屏東縣', district: '東港鎮' },
  '929': { city: '屏東縣', district: '琉球鄉' },
  '944': { city: '屏東縣', district: '車城鄉' },
  '946': { city: '屏東縣', district: '恆春鎮' },
  // 台東縣
  '950': { city: '台東縣', district: '台東市' },
  '954': { city: '台東縣', district: '卑南鄉' },
  '955': { city: '台東縣', district: '鹿野鄉' },
  '956': { city: '台東縣', district: '關山鎮' },
  '958': { city: '台東縣', district: '池上鄉' },
  '961': { city: '台東縣', district: '成功鎮' },
  '963': { city: '台東縣', district: '太麻里鄉' },
  // 花蓮縣
  '970': { city: '花蓮縣', district: '花蓮市' },
  '971': { city: '花蓮縣', district: '新城鄉' },
  '972': { city: '花蓮縣', district: '秀林鄉' },
  '973': { city: '花蓮縣', district: '吉安鄉' },
  '974': { city: '花蓮縣', district: '壽豐鄉' },
  '975': { city: '花蓮縣', district: '鳳林鎮' },
  '976': { city: '花蓮縣', district: '光復鄉' },
  '978': { city: '花蓮縣', district: '瑞穗鄉' },
  '981': { city: '花蓮縣', district: '玉里鎮' },
};

/**
 * Complete City -> Districts mapping for all 22 cities and counties of Taiwan,
 * dynamically synthesized from official 3-digit postal code gazetteer + popular Japan cities.
 */
export const ALL_TAIWAN_CITY_DISTRICTS: Record<string, string[]> = {};
for (const info of Object.values(TAIWAN_ZIP_TO_REGION)) {
  if (!ALL_TAIWAN_CITY_DISTRICTS[info.city]) {
    ALL_TAIWAN_CITY_DISTRICTS[info.city] = [];
  }
  if (!ALL_TAIWAN_CITY_DISTRICTS[info.city].includes(info.district)) {
    ALL_TAIWAN_CITY_DISTRICTS[info.city].push(info.district);
  }
}
// Popular Japan Cities
ALL_TAIWAN_CITY_DISTRICTS['東京都'] = [
  '台東區', '千代田區', '新宿區', '澀谷區', '港區', '中央區', '墨田區', '文京區', '豐島區',
];
ALL_TAIWAN_CITY_DISTRICTS['京都府'] = [
  '中京區', '下京區', '東山區', '左京區', '右京區', '北區', '上京區',
];
ALL_TAIWAN_CITY_DISTRICTS['大阪府'] = [
  '中央區', '北區', '浪速區', '西區', '天王寺區', '福島區',
];

export function getDistrictsForCity(city: string): string[] {
  return ALL_TAIWAN_CITY_DISTRICTS[city] || [];
}

export const ALL_TAIWAN_CITIES: string[] = Object.keys(ALL_TAIWAN_CITY_DISTRICTS);

export const DISTRICT_CENTROIDS: Array<{
  city: string;
  district: string;
  lat: number;
  lng: number;
}> = [
  // 台南市 (所有37行政區全數精準覆蓋 + 市中心密集子中心)
  { city: '台南市', district: '中西區', lat: 22.9935, lng: 120.1985 },
  { city: '台南市', district: '中西區', lat: 22.9985, lng: 120.1925 }, // 兌悅里/金華路四段/神農街/西市場
  { city: '台南市', district: '中西區', lat: 22.9895, lng: 120.2035 }, // 孔廟/府前路
  { city: '台南市', district: '北區', lat: 23.0055, lng: 120.2035 },   // 崇安街/鴨母寮/成功路北側
  { city: '台南市', district: '北區', lat: 23.0135, lng: 120.2065 },   // 花園夜市/海安路三段
  { city: '台南市', district: '北區', lat: 23.0065, lng: 120.2195 },   // 開元路/成大北側
  { city: '台南市', district: '東區', lat: 22.9865, lng: 120.2215 },   // 成大/育樂街/長榮路
  { city: '台南市', district: '東區', lat: 22.9765, lng: 120.2305 },   // 文化中心/崇明路
  { city: '台南市', district: '南區', lat: 22.9868, lng: 120.1979 },   // 西門路一段/新昌里/藍晒圖/新光新天地/酣呷餐酒
  { city: '台南市', district: '南區', lat: 22.9785, lng: 120.1935 },   // 夏林路/客家文化會館
  { city: '台南市', district: '南區', lat: 22.9685, lng: 120.1915 },   // 水交社/西門路一段南側
  { city: '台南市', district: '南區', lat: 22.9525, lng: 120.1865 },   // 灣裡/喜樹
  { city: '台南市', district: '安平區', lat: 22.9995, lng: 120.1625 }, // 安平老街/古堡
  { city: '台南市', district: '安平區', lat: 22.9895, lng: 120.1715 }, // 五期/永華路二段
  { city: '台南市', district: '永康區', lat: 23.0125, lng: 120.2335 }, // 中華路/南台科大/大橋
  { city: '台南市', district: '永康區', lat: 23.0285, lng: 120.2565 }, // 永康市區/大灣
  { city: '台南市', district: '安南區', lat: 23.047, lng: 120.185 },
  { city: '台南市', district: '新化區', lat: 23.038, lng: 120.311 }, // 新化老街/大智路/阿蓮牛肉湯
  { city: '台南市', district: '左鎮區', lat: 23.058, lng: 120.362 }, // 化石園區/王家燻羊肉
  { city: '台南市', district: '玉井區', lat: 23.124, lng: 120.461 },
  { city: '台南市', district: '楠西區', lat: 23.173, lng: 120.485 },
  { city: '台南市', district: '南化區', lat: 23.043, lng: 120.477 },
  { city: '台南市', district: '仁德區', lat: 22.942, lng: 120.242 },
  { city: '台南市', district: '歸仁區', lat: 22.925, lng: 120.286 },
  { city: '台南市', district: '關廟區', lat: 22.962, lng: 120.328 },
  { city: '台南市', district: '龍崎區', lat: 22.952, lng: 120.385 },
  { city: '台南市', district: '善化區', lat: 23.132, lng: 120.296 },
  { city: '台南市', district: '新市區', lat: 23.079, lng: 120.295 },
  { city: '台南市', district: '安定區', lat: 23.101, lng: 120.237 },
  { city: '台南市', district: '山上區', lat: 23.104, lng: 120.354 },
  { city: '台南市', district: '大內區', lat: 23.120, lng: 120.350 },
  { city: '台南市', district: '麻豆區', lat: 23.1873, lng: 120.2599 }, // 總爺藝文中心/麻豆市區
  { city: '台南市', district: '佳里區', lat: 23.165, lng: 120.177 },
  { city: '台南市', district: '西港區', lat: 23.123, lng: 120.203 },
  { city: '台南市', district: '七股區', lat: 23.141, lng: 120.126 },
  { city: '台南市', district: '將軍區', lat: 23.199, lng: 120.158 },
  { city: '台南市', district: '北門區', lat: 23.267, lng: 120.126 },
  { city: '台南市', district: '學甲區', lat: 23.232, lng: 120.181 },
  { city: '台南市', district: '官田區', lat: 23.194, lng: 120.314 },
  { city: '台南市', district: '六甲區', lat: 23.231, lng: 120.347 },
  { city: '台南市', district: '下營區', lat: 23.235, lng: 120.264 },
  { city: '台南市', district: '柳營區', lat: 23.278, lng: 120.312 },
  { city: '台南市', district: '鹽水區', lat: 23.319, lng: 120.266 },
  { city: '台南市', district: '新營區', lat: 23.31, lng: 120.316 },
  { city: '台南市', district: '後壁區', lat: 23.366, lng: 120.362 },
  { city: '台南市', district: '白河區', lat: 23.351, lng: 120.415 },
  { city: '台南市', district: '東山區', lat: 23.326, lng: 120.404 },
  // 高雄市 (38行政區全數覆蓋)
  { city: '高雄市', district: '鹽埕區', lat: 22.624, lng: 120.284 },
  { city: '高雄市', district: '鼓山區', lat: 22.632, lng: 120.273 }, // 哈瑪星/西子灣
  { city: '高雄市', district: '鼓山區', lat: 22.661, lng: 120.291 }, // 美術館/瑞豐
  { city: '高雄市', district: '前金區', lat: 22.627, lng: 120.295 },
  { city: '高雄市', district: '新興區', lat: 22.631, lng: 120.305 },
  { city: '高雄市', district: '苓雅區', lat: 22.621, lng: 120.318 },
  { city: '高雄市', district: '前鎮區', lat: 22.594, lng: 120.316 },
  { city: '高雄市', district: '旗津區', lat: 22.589, lng: 120.274 },
  { city: '高雄市', district: '左營區', lat: 22.685, lng: 120.298 },
  { city: '高雄市', district: '楠梓區', lat: 22.728, lng: 120.312 },
  { city: '高雄市', district: '三民區', lat: 22.648, lng: 120.322 },
  { city: '高雄市', district: '鳳山區', lat: 22.627, lng: 120.357 },
  { city: '高雄市', district: '小港區', lat: 22.565, lng: 120.354 },
  { city: '高雄市', district: '仁武區', lat: 22.701, lng: 120.348 },
  { city: '高雄市', district: '大社區', lat: 22.730, lng: 120.347 },
  { city: '高雄市', district: '鳥松區', lat: 22.659, lng: 120.364 },
  { city: '高雄市', district: '大寮區', lat: 22.605, lng: 120.395 },
  { city: '高雄市', district: '林園區', lat: 22.506, lng: 120.396 },
  { city: '高雄市', district: '岡山區', lat: 22.796, lng: 120.296 },
  { city: '高雄市', district: '路竹區', lat: 22.856, lng: 120.261 },
  { city: '高雄市', district: '阿蓮區', lat: 22.883, lng: 120.327 },
  { city: '高雄市', district: '田寮區', lat: 22.876, lng: 120.360 },
  { city: '高雄市', district: '燕巢區', lat: 22.793, lng: 120.362 },
  { city: '高雄市', district: '橋頭區', lat: 22.757, lng: 120.305 },
  { city: '高雄市', district: '梓官區', lat: 22.760, lng: 120.267 },
  { city: '高雄市', district: '彌陀區', lat: 22.782, lng: 120.247 },
  { city: '高雄市', district: '永安區', lat: 22.818, lng: 120.226 },
  { city: '高雄市', district: '湖內區', lat: 22.908, lng: 120.215 },
  { city: '高雄市', district: '茄萣區', lat: 22.906, lng: 120.183 },
  { city: '高雄市', district: '大樹區', lat: 22.693, lng: 120.432 },
  { city: '高雄市', district: '旗山區', lat: 22.888, lng: 120.483 },
  { city: '高雄市', district: '美濃區', lat: 22.899, lng: 120.541 },
  { city: '高雄市', district: '六龜區', lat: 22.997, lng: 120.634 },
  { city: '高雄市', district: '內門區', lat: 22.943, lng: 120.462 },
  { city: '高雄市', district: '杉林區', lat: 22.971, lng: 120.539 },
  { city: '高雄市', district: '甲仙區', lat: 23.082, lng: 120.591 },
  { city: '高雄市', district: '桃源區', lat: 23.161, lng: 120.761 },
  { city: '高雄市', district: '那瑪夏區', lat: 23.238, lng: 120.697 },
  { city: '高雄市', district: '茂林區', lat: 22.887, lng: 120.665 },
  // 台北市 (12區 dense sub-centroids)
  { city: '台北市', district: '大同區', lat: 25.056, lng: 121.511 }, // 大稻埕/迪化街
  { city: '台北市', district: '大同區', lat: 25.068, lng: 121.516 }, // 圓山/大龍峒
  { city: '台北市', district: '中正區', lat: 25.043, lng: 121.517 }, // 台北車站/華山
  { city: '台北市', district: '中正區', lat: 25.027, lng: 121.522 }, // 古亭/中正紀念堂/公館
  { city: '台北市', district: '萬華區', lat: 25.042, lng: 121.506 }, // 西門町
  { city: '台北市', district: '萬華區', lat: 25.033, lng: 121.499 }, // 龍山寺/艋舺
  { city: '台北市', district: '中山區', lat: 25.053, lng: 121.525 }, // 中山站/條通/赤峰街東側
  { city: '台北市', district: '中山區', lat: 25.061, lng: 121.535 }, // 行天宮/民生東路二段/松江南京
  { city: '台北市', district: '中山區', lat: 25.081, lng: 121.553 }, // 大直/美麗華/樂群二路
  { city: '台北市', district: '松山區', lat: 25.052, lng: 121.552 }, // 小巨蛋/南京三民
  { city: '台北市', district: '松山區', lat: 25.059, lng: 121.563 }, // 民生社區/富錦街/饒河街
  { city: '台北市', district: '大安區', lat: 25.041, lng: 121.547 }, // 東區/忠孝敦化/忠孝復興
  { city: '台北市', district: '大安區', lat: 25.033, lng: 121.531 }, // 永康街/東門
  { city: '台北市', district: '大安區', lat: 25.032, lng: 121.553 }, // 信義安和/通化街/安和路
  { city: '台北市', district: '大安區', lat: 25.021, lng: 121.535 }, // 台大/師大/溫州街
  { city: '台北市', district: '信義區', lat: 25.034, lng: 121.565 }, // 台北101/信義商圈
  { city: '台北市', district: '信義區', lat: 25.042, lng: 121.576 }, // 松菸/永吉路/五分埔
  { city: '台北市', district: '內湖區', lat: 25.081, lng: 121.575 }, // 內湖科學園區/西湖/港墘
  { city: '台北市', district: '內湖區', lat: 25.095, lng: 121.588 }, // 碧山巖/白石湖/東湖
  { city: '台北市', district: '南港區', lat: 25.055, lng: 121.607 },
  { city: '台北市', district: '士林區', lat: 25.089, lng: 121.525 }, // 士林夜市/劍潭
  { city: '台北市', district: '士林區', lat: 25.118, lng: 121.531 }, // 天母
  { city: '台北市', district: '北投區', lat: 25.134, lng: 121.503 },
  { city: '台北市', district: '文山區', lat: 24.993, lng: 121.571 },
  // 新北市
  { city: '新北市', district: '板橋區', lat: 25.011, lng: 121.462 },
  { city: '新北市', district: '三重區', lat: 25.061, lng: 121.488 },
  { city: '新北市', district: '中和區', lat: 24.999, lng: 121.498 },
  { city: '新北市', district: '永和區', lat: 25.009, lng: 121.515 },
  { city: '新北市', district: '新莊區', lat: 25.036, lng: 121.451 },
  { city: '新北市', district: '新店區', lat: 24.968, lng: 121.541 },
  { city: '新北市', district: '土城區', lat: 24.972, lng: 121.443 },
  { city: '新北市', district: '蘆洲區', lat: 25.085, lng: 121.474 },
  { city: '新北市', district: '汐止區', lat: 25.068, lng: 121.662 },
  { city: '新北市', district: '淡水區', lat: 25.175, lng: 121.443 },
  { city: '新北市', district: '瑞芳區', lat: 25.109, lng: 121.845 }, // 九份/瑞芳
  { city: '新北市', district: '三峽區', lat: 24.934, lng: 121.369 },
  { city: '新北市', district: '鶯歌區', lat: 24.955, lng: 121.354 },
  { city: '新北市', district: '林口區', lat: 25.077, lng: 121.389 },
  // 基隆市
  { city: '基隆市', district: '仁愛區', lat: 25.128, lng: 121.743 },
  { city: '基隆市', district: '中正區', lat: 25.148, lng: 121.773 },
  // 桃園市
  { city: '桃園市', district: '桃園區', lat: 24.993, lng: 121.301 },
  { city: '桃園市', district: '中壢區', lat: 24.958, lng: 121.225 },
  { city: '桃園市', district: '八德區', lat: 24.938, lng: 121.288 },
  { city: '桃園市', district: '平鎮區', lat: 24.929, lng: 121.205 },
  { city: '桃園市', district: '龜山區', lat: 25.024, lng: 121.355 },
  { city: '桃園市', district: '蘆竹區', lat: 25.045, lng: 121.292 },
  { city: '桃園市', district: '大溪區', lat: 24.883, lng: 121.287 },
  { city: '桃園市', district: '龍潭區', lat: 24.864, lng: 121.216 },
  // 新竹市/縣
  { city: '新竹市', district: '東區', lat: 24.801, lng: 120.975 },
  { city: '新竹市', district: '北區', lat: 24.816, lng: 120.958 },
  { city: '新竹縣', district: '竹北市', lat: 24.828, lng: 121.012 },
  { city: '新竹縣', district: '北埔鄉', lat: 24.699, lng: 121.058 },
  // 台中市
  { city: '台中市', district: '中區', lat: 24.142, lng: 120.681 },
  { city: '台中市', district: '西區', lat: 24.147, lng: 120.663 }, // 勤美/審計新村/公益路
  { city: '台中市', district: '北區', lat: 24.157, lng: 120.682 }, // 一中街
  { city: '台中市', district: '東區', lat: 24.137, lng: 120.695 },
  { city: '台中市', district: '南區', lat: 24.119, lng: 120.668 },
  { city: '台中市', district: '西屯區', lat: 24.165, lng: 120.641 }, // 七期/歌劇院
  { city: '台中市', district: '西屯區', lat: 24.179, lng: 120.645 }, // 逢甲
  { city: '台中市', district: '南屯區', lat: 24.139, lng: 120.635 },
  { city: '台中市', district: '北屯區', lat: 24.182, lng: 120.686 },
  { city: '台中市', district: '豐原區', lat: 24.254, lng: 120.718 },
  { city: '台中市', district: '清水區', lat: 24.268, lng: 120.559 },
  // 彰化/南投/雲林/嘉義
  { city: '彰化縣', district: '彰化市', lat: 24.081, lng: 120.538 },
  { city: '彰化縣', district: '鹿港鎮', lat: 24.056, lng: 120.435 },
  { city: '彰化縣', district: '員林市', lat: 23.959, lng: 120.574 },
  { city: '南投縣', district: '埔里鎮', lat: 23.966, lng: 120.969 },
  { city: '南投縣', district: '魚池鄉', lat: 23.865, lng: 120.915 }, // 日月潭
  { city: '南投縣', district: '仁愛鄉', lat: 24.043, lng: 121.157 }, // 清境
  { city: '雲林縣', district: '斗六市', lat: 23.709, lng: 120.543 },
  { city: '嘉義市', district: '東區', lat: 23.481, lng: 120.453 },
  { city: '嘉義市', district: '西區', lat: 23.479, lng: 120.441 },
  { city: '嘉義縣', district: '阿里山鄉', lat: 23.511, lng: 120.803 },
  // 屏東/宜蘭/花蓮/台東/澎湖
  { city: '屏東縣', district: '屏東市', lat: 22.676, lng: 120.488 },
  { city: '屏東縣', district: '東港鎮', lat: 22.466, lng: 120.449 },
  { city: '屏東縣', district: '恆春鎮', lat: 22.004, lng: 120.746 },
  { city: '屏東縣', district: '琉球鄉', lat: 22.342, lng: 120.371 },
  { city: '宜蘭縣', district: '宜蘭市', lat: 24.757, lng: 121.753 },
  { city: '宜蘭縣', district: '羅東鎮', lat: 24.677, lng: 121.767 },
  { city: '宜蘭縣', district: '礁溪鄉', lat: 24.828, lng: 121.773 },
  { city: '宜蘭縣', district: '頭城鎮', lat: 24.859, lng: 121.823 },
  { city: '宜蘭縣', district: '冬山鄉', lat: 24.635, lng: 121.792 },
  { city: '宜蘭縣', district: '五結鄉', lat: 24.685, lng: 121.798 },
  { city: '宜蘭縣', district: '蘇澳鎮', lat: 24.596, lng: 121.851 },
  { city: '花蓮縣', district: '花蓮市', lat: 23.977, lng: 121.604 },
  { city: '花蓮縣', district: '吉安鄉', lat: 23.961, lng: 121.564 },
  { city: '花蓮縣', district: '壽豐鄉', lat: 23.871, lng: 121.511 },
  { city: '花蓮縣', district: '秀林鄉', lat: 24.158, lng: 121.621 },
  { city: '花蓮縣', district: '瑞穗鄉', lat: 23.497, lng: 121.377 },
  { city: '花蓮縣', district: '玉里鎮', lat: 23.336, lng: 121.312 },
  { city: '台東縣', district: '台東市', lat: 22.756, lng: 121.144 },
  { city: '台東縣', district: '池上鄉', lat: 23.122, lng: 121.219 },
  { city: '台東縣', district: '鹿野鄉', lat: 22.912, lng: 121.136 },
  { city: '台東縣', district: '成功鎮', lat: 23.101, lng: 121.379 },
  { city: '澎湖縣', district: '馬公市', lat: 23.565, lng: 119.566 },
];

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

  // 1. Taiwan Address Match (supports addresses with or without District, and with trailing Village/Boulevard)
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
      const dMatch = afterCity.match(/^([^\d\s,]{1,3}?[區市鎮鄉])/);
      if (dMatch) {
        detectedDistrict = dMatch[1];
      }
    }
    // Check 3-digit postal code prefix if district was omitted in address
    if (!detectedDistrict) {
      const zipMatch = foundAddress.match(/^(\d{3})\d{0,3}/);
      if (zipMatch && TAIWAN_ZIP_TO_REGION[zipMatch[1]]) {
        detectedDistrict = TAIWAN_ZIP_TO_REGION[zipMatch[1]].district;
        if (!detectedCity) {
          detectedCity = TAIWAN_ZIP_TO_REGION[zipMatch[1]].city;
        }
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
      const dMatch = foundAddress.match(/([^\s,都道府県]+?[区區市町村])/);
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

  // Resolve district from landmark/road hint if missing
  if (!detectedDistrict) {
    for (const rule of LANDMARK_OR_ROAD_TO_DISTRICT) {
      if (rule.keywords.some((kw) => str.includes(kw))) {
        if (!detectedCity) detectedCity = rule.city;
        if (detectedCity === rule.city) {
          detectedDistrict = rule.district;
          break;
        }
      }
    }
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
 * Automatically extract country, city, and district from an address, URL, or coordinates
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

  // 0. Extract coordinates from Google Maps URL if present, or use passed coords
  const urlCoords = extractCoordsFromGoogleMapsUrl(clean);
  const effectiveCoords = urlCoords || coords;

  // 1. SUPREME AUTHORITY: If coordinates are available (from Google Maps URL or input),
  // the location is physically anchored to these exact coordinates on Earth.
  // URL coordinates MUST strictly determine city and district without arbitrary text heuristics!
  if (
    effectiveCoords &&
    !isNaN(effectiveCoords.lat) &&
    !isNaN(effectiveCoords.lng)
  ) {
    const { lat, lng } = effectiveCoords;

    // 1a. Japan bounds check
    if (lat >= 30.0 && lat <= 46.0 && lng >= 128.0 && lng <= 146.0) {
      const cityMatch = clean.match(
        /(東京都|大阪府|京都府|北海道|[^\s,]+?[都道府県])/
      );
      const distMatch = clean.match(/([^\s,都道府県]+?[区區市町村])/);
      return {
        country: '日本',
        city: cityMatch ? cityMatch[1] : (lat > 35.5 && lng > 139.0 ? '東京都' : '大阪府'),
        district: distMatch ? distMatch[1] : '台東區',
      };
    }

    // 1b. Taiwan bounds check
    if (lat >= 21.5 && lat <= 26.5 && lng >= 118.0 && lng <= 122.5) {
      let nearestDist = '';
      let nearestCity = '';
      let minMeters = Infinity;

      for (const c of DISTRICT_CENTROIDS) {
        const d = calculateDistanceMeters(lat, lng, c.lat, c.lng);
        if (d < minMeters) {
          minMeters = d;
          nearestCity = c.city;
          nearestDist = c.district;
        }
      }

      // Border fine-tuning: Only if the address contains an explicit 3-digit postal code
      // (e.g. 700) or explicit district name with '區' in the EXACT SAME CITY, and the pin
      // is within 3.5km of that district centroid, allow it to refine adjacent borders:
      const zipMatch = clean.match(
        /(?:^|\s|,)(\d{3})\d{0,3}\s*(?:台灣|臺灣|臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|高雄市|基隆市|新竹|苗栗|彰化|南投|雲林|嘉義|屏東|宜蘭|花蓮|臺東|台東|澎湖|金門)/
      );
      if (zipMatch && TAIWAN_ZIP_TO_REGION[zipMatch[1]]) {
        const zipRegion = TAIWAN_ZIP_TO_REGION[zipMatch[1]];
        if (zipRegion.city === nearestCity) {
          const zipCentroid = DISTRICT_CENTROIDS.find(
            (c) => c.city === zipRegion.city && c.district === zipRegion.district
          );
          if (
            zipCentroid &&
            calculateDistanceMeters(lat, lng, zipCentroid.lat, zipCentroid.lng) < 3500
          ) {
            nearestDist = zipRegion.district;
          }
        }
      }

      return {
        country: '台灣',
        city: nearestCity || '台南市',
        district: nearestDist || '中西區',
      };
    }
  }

  // 2. TEXT-ONLY FALLBACK: Only executed when coordinates are completely unavailable:
  // 2a. Japan detection
  if (
    clean.includes('日本') ||
    clean.includes('東京都') ||
    clean.includes('大阪府') ||
    clean.includes('京都府') ||
    /\b(?:Tokyo|Osaka|Kyoto|Japan)\b/i.test(clean)
  ) {
    const cityMatch = clean.match(
      /(東京都|大阪府|京都府|北海道|[^\s,]+?[都道府県])/
    );
    const distMatch = clean.match(/([^\s,都道府県]+?[区區市町村])/);
    return {
      country: '日本',
      city: cityMatch ? cityMatch[1] : '東京都',
      district: distMatch ? distMatch[1] : '台東區',
    };
  }

  let cityRaw = '';
  let district = '';

  // 2b. Taiwan 3-digit Postal Code detection
  const zipMatch = clean.match(
    /(?:^|\s|,)(\d{3})\d{0,3}\s*(?:台灣|臺灣|臺北市|台北市|新北市|桃園市|臺中市|台中市|臺南市|台南市|高雄市|基隆市|新竹|苗栗|彰化|南投|雲林|嘉義|屏東|宜蘭|花蓮|臺東|台東|澎湖|金門)/
  );
  if (zipMatch && TAIWAN_ZIP_TO_REGION[zipMatch[1]]) {
    cityRaw = TAIWAN_ZIP_TO_REGION[zipMatch[1]].city;
    district = TAIWAN_ZIP_TO_REGION[zipMatch[1]].district;
  }

  // 2c. Explicit Taiwan City detection (Chinese + English)
  const twCityMatch = clean.match(
    /(台北市|臺北市|新北市|桃園市|台中市|臺中市|台南市|臺南市|高雄市|基隆市|新竹市|新竹縣|苗栗縣|彰化縣|南投縣|雲林縣|嘉義市|嘉義縣|屏東縣|宜蘭縣|花蓮縣|台東縣|臺東縣|澎湖縣|金門縣)/
  );

  if (twCityMatch) {
    const matchedCity = twCityMatch[1].replace('臺', '台');
    if (!cityRaw) cityRaw = matchedCity;
    const afterCity = clean.slice(
      clean.indexOf(twCityMatch[1]) + twCityMatch[1].length
    );
    const distMatch = afterCity.match(/^([^\d\s,]{1,3}?[區市鎮鄉])/);
    if (distMatch) {
      district = distMatch[1];
    }
  } else if (!cityRaw) {
    const englishOrShortCityMap: Array<{ pattern: RegExp; city: string }> = [
      { pattern: /台南|臺南|\bTainan\b/i, city: '台南市' },
      { pattern: /新北市|\bNew\s*Taipei\b/i, city: '新北市' },
      { pattern: /台北|臺北|\bTaipei\b/i, city: '台北市' },
      { pattern: /台中|臺中|\bTaichung\b/i, city: '台中市' },
      { pattern: /高雄|\bKaohsiung\b/i, city: '高雄市' },
      { pattern: /桃園|\bTaoyuan\b/i, city: '桃園市' },
      { pattern: /嘉義|\bChiayi\b/i, city: '嘉義市' },
      { pattern: /新竹|\bHsinchu\b/i, city: '新竹市' },
      { pattern: /基隆|\bKeelung\b/i, city: '基隆市' },
      { pattern: /宜蘭|\bYilan\b/i, city: '宜蘭縣' },
      { pattern: /花蓮|\bHualien\b/i, city: '花蓮縣' },
      { pattern: /台東|臺東|\bTaitung\b/i, city: '台東縣' },
      { pattern: /屏東|\bPingtung\b/i, city: '屏東縣' },
      { pattern: /南投|\bNantou\b/i, city: '南投縣' },
      { pattern: /彰化|\bChanghua\b/i, city: '彰化縣' },
      { pattern: /苗栗|\bMiaoli\b/i, city: '苗栗縣' },
      { pattern: /雲林|\bYunlin\b/i, city: '雲林縣' },
      { pattern: /澎湖|\bPenghu\b/i, city: '澎湖縣' },
    ];
    for (const item of englishOrShortCityMap) {
      if (item.pattern.test(clean)) {
        cityRaw = item.city;
        break;
      }
    }
  }

  // 2d. Match from known districts
  if (!cityRaw || !district) {
    for (const [distKey, mappedCity] of Object.entries(DISTRICT_TO_CITY_MAP)) {
      if (clean.includes(distKey)) {
        if (!cityRaw) cityRaw = mappedCity;
        if (cityRaw === mappedCity && !district) {
          district =
            distKey.endsWith('區') ||
            distKey.endsWith('鎮') ||
            distKey.endsWith('鄉')
              ? distKey
              : `${distKey}區`;
          break;
        }
      }
    }
  }

  // 2e. Match from known landmark/village/road hints
  const isWeakDistrict = !district || !/[0-9]+號/.test(clean);
  if (isWeakDistrict) {
    for (const rule of LANDMARK_OR_ROAD_TO_DISTRICT) {
      if (rule.keywords.some((kw) => clean.includes(kw))) {
        if (!cityRaw || cityRaw === rule.city) {
          cityRaw = rule.city;
          district = rule.district;
          break;
        }
      }
    }
  }

  // 6. Final fallback
  if (!cityRaw) {
    cityRaw = fallbackCity || '台南市';
  }

  if (!district) {
    const genericDist = clean.match(
      /(?<!夜|超|門|菜|魚|花|古|早|牛|果)([^\d\s,]{1,3}[區鎮鄉])/
    );
    const defaultDistrictByCity: Record<string, string> = {
      台北市: '大安區',
      新北市: '板橋區',
      桃園市: '桃園區',
      台中市: '西區',
      台南市: '中西區',
      高雄市: '鹽埕區',
      基隆市: '仁愛區',
      新竹市: '東區',
      新竹縣: '竹北市',
      苗栗縣: '苗栗市',
      彰化縣: '彰化市',
      南投縣: '埔里鎮',
      雲林縣: '斗六市',
      嘉義市: '東區',
      嘉義縣: '太保市',
      屏東縣: '屏東市',
      宜蘭縣: '礁溪鄉',
      花蓮縣: '花蓮市',
      台東縣: '台東市',
      澎湖縣: '馬公市',
    };
    district = genericDist
      ? genericDist[1]
      : defaultDistrictByCity[cityRaw] || '市中心';
  }

  return {
    country: '台灣',
    city: cityRaw,
    district,
  };
}

export function getCoordinatesForRegion(
  city: string,
  district: string,
  seedStr = ''
): { lat: number; lng: number } {
  const exact = DISTRICT_CENTROIDS.find(
    (c) => c.city === city && c.district === district
  );
  const byCity = DISTRICT_CENTROIDS.find((c) => c.city === city);
  const base = exact || byCity || { lat: 25.033, lng: 121.543 };

  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) | 0;
  }
  const dLat = ((hash % 100) / 100) * 0.004 - 0.002;
  const dLng = (((hash >> 4) % 100) / 100) * 0.004 - 0.002;

  return {
    lat: Number((base.lat + dLat).toFixed(6)),
    lng: Number((base.lng + dLng).toFixed(6)),
  };
}

export function inferPlaceCategoryByName(text: string): {
  primary_category: string;
  sub_category: string;
  estimated_stay_mins: number;
} {
  const lower = (text || '').toLowerCase();
  if (/伴手禮|名產|禮盒|餅店|糕餅|鳳梨酥|肉乾|茶葉/.test(text)) {
    return {
      primary_category: 'restaurant',
      sub_category: 'souvenir',
      estimated_stay_mins: 20,
    };
  }
  if (
    /咖啡|甜點|冰|茶|下午茶|布丁|豆花|蛋糕|烘焙|cafe|coffee|bakery|dessert/.test(
      lower
    )
  ) {
    return {
      primary_category: 'restaurant',
      sub_category: 'snack_dessert',
      estimated_stay_mins: 50,
    };
  }
  if (
    /藝文中心|文化中心|藝術中心|文化園區|文創園區|美術館|博物館|展覽館|展覽|特區|藝術館|歷史館|鐵道館|糖廠|工坊|藝文|展演|故事館|紀念館|museum|gallery|art center/.test(
      lower
    )
  ) {
    return {
      primary_category: 'museum_culture',
      sub_category: 'museum',
      estimated_stay_mins: 110,
    };
  }
  if (
    /古蹟|碧山巖|寺|廟|宮|神社|城隍|紀念堂|老街|地標|休閒中心|砲台|燈塔|城門|堡/.test(
      lower
    )
  ) {
    return {
      primary_category: 'museum_culture',
      sub_category: 'landmark',
      estimated_stay_mins: 60,
    };
  }
  if (/步道|公園|山|森林|自然|風景|海岸|吊橋/.test(lower)) {
    return {
      primary_category: 'nature_outdoor',
      sub_category: 'trail',
      estimated_stay_mins: 90,
    };
  }
  if (
    /餐酒|酒吧|bistro|\bbar\b|居酒屋|啤酒|精釀|小酌|調酒|\bpub\b|\bwine\b|\bbeer\b|酉|微醺|釀造|酒造|品酒|bottle|瓶子|選酒|自然酒|紅白酒|葡萄酒|洋酒|烈酒|清酒|威士忌|whisky|whiskey|cocktail|gin|sake|taproom|draft|酒館|酒莊/.test(
      lower
    )
  ) {
    return {
      primary_category: 'restaurant',
      sub_category: 'bar',
      estimated_stay_mins: 90,
    };
  }
  return {
    primary_category: 'restaurant',
    sub_category: 'meal',
    estimated_stay_mins: 80,
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
