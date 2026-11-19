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
      '湯德章大道',
      '臺灣文學館',
      '台灣文學館',
      '林百貨',
      '赤崁樓',
      '神農街',
      '國華街',
      '保安路',
      '海安路',
      '友愛街',
      '正興街',
      '民族路二段',
      '民生路一段',
      '民生路二段',
      '府前路',
      '西門路二段',
      '忠義路',
      '永福路',
      '中正路1號',
    ],
    city: '台南市',
    district: '中西區',
  },
  {
    keywords: ['安平古堡', '安平老街', '安平樹屋', '億載金城', '安平路', '古堡街', '漁光島'],
    city: '台南市',
    district: '安平區',
  },
  {
    keywords: ['奇美博物館', '十鼓文創', '虎山里', '文華路二段'],
    city: '台南市',
    district: '仁德區',
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
export const DISTRICT_CENTROIDS: Array<{
  city: string;
  district: string;
  lat: number;
  lng: number;
}> = [
  { city: '台南市', district: '中西區', lat: 22.992, lng: 120.198 },
  { city: '台南市', district: '安平區', lat: 22.998, lng: 120.161 },
  { city: '台南市', district: '東區', lat: 22.981, lng: 120.224 },
  { city: '台南市', district: '北區', lat: 23.011, lng: 120.205 },
  { city: '台南市', district: '南區', lat: 22.961, lng: 120.188 },
  { city: '台南市', district: '永康區', lat: 23.026, lng: 120.256 },
  { city: '台南市', district: '安南區', lat: 23.047, lng: 120.185 },
  { city: '台南市', district: '新化區', lat: 23.038, lng: 120.311 },
  { city: '台南市', district: '仁德區', lat: 22.942, lng: 120.242 },
  { city: '台南市', district: '歸仁區', lat: 22.925, lng: 120.286 },
  { city: '台南市', district: '龍崎區', lat: 22.952, lng: 120.385 },
  { city: '台南市', district: '善化區', lat: 23.132, lng: 120.296 },
  { city: '台南市', district: '玉井區', lat: 23.124, lng: 120.461 },
  { city: '高雄市', district: '鹽埕區', lat: 22.624, lng: 120.284 },
  { city: '高雄市', district: '鼓山區', lat: 22.648, lng: 120.276 },
  { city: '高雄市', district: '前金區', lat: 22.627, lng: 120.295 },
  { city: '高雄市', district: '新興區', lat: 22.631, lng: 120.305 },
  { city: '高雄市', district: '苓雅區', lat: 22.621, lng: 120.318 },
  { city: '高雄市', district: '前鎮區', lat: 22.594, lng: 120.316 },
  { city: '高雄市', district: '左營區', lat: 22.685, lng: 120.298 },
  { city: '高雄市', district: '三民區', lat: 22.648, lng: 120.322 },
  { city: '高雄市', district: '鳳山區', lat: 22.627, lng: 120.357 },
  { city: '台北市', district: '大同區', lat: 25.063, lng: 121.513 },
  { city: '台北市', district: '中正區', lat: 25.032, lng: 121.518 },
  { city: '台北市', district: '萬華區', lat: 25.035, lng: 121.499 },
  { city: '台北市', district: '中山區', lat: 25.064, lng: 121.533 },
  { city: '台北市', district: '松山區', lat: 25.056, lng: 121.558 },
  { city: '台北市', district: '大安區', lat: 25.026, lng: 121.543 },
  { city: '台北市', district: '信義區', lat: 25.033, lng: 121.568 },
  { city: '台北市', district: '內湖區', lat: 25.083, lng: 121.588 },
  { city: '台北市', district: '南港區', lat: 25.055, lng: 121.607 },
  { city: '台北市', district: '士林區', lat: 25.092, lng: 121.525 },
  { city: '台北市', district: '北投區', lat: 25.132, lng: 121.501 },
  { city: '台北市', district: '文山區', lat: 24.993, lng: 121.571 },
  { city: '新北市', district: '板橋區', lat: 25.011, lng: 121.462 },
  { city: '新北市', district: '中和區', lat: 24.999, lng: 121.498 },
  { city: '新北市', district: '永和區', lat: 25.009, lng: 121.515 },
  { city: '新北市', district: '新店區', lat: 24.968, lng: 121.541 },
  { city: '新北市', district: '淡水區', lat: 25.175, lng: 121.443 },
  { city: '台中市', district: '中區', lat: 24.142, lng: 120.681 },
  { city: '台中市', district: '西區', lat: 24.145, lng: 120.663 },
  { city: '台中市', district: '西屯區', lat: 24.179, lng: 120.641 },
  { city: '台中市', district: '北區', lat: 24.157, lng: 120.682 },
  { city: '台中市', district: '南屯區', lat: 24.139, lng: 120.635 },
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
    const distMatch = clean.match(/([^\s,都道府県]+?[区區市町村])/);
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
    const distMatch = afterCity.match(/^([^\d\s,]{1,3}?[區市鎮鄉])/);
    if (distMatch) {
      district = distMatch[1];
    }
  }

  // 3. Match from known districts (e.g. 新化區 -> 台南市)
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

  // 4. Match from known landmark/village/road hints (e.g. 永華里 / 湯德章大道 -> 台南市・中西區)
  if (!district) {
    for (const rule of LANDMARK_OR_ROAD_TO_DISTRICT) {
      if (rule.keywords.some((kw) => clean.includes(kw))) {
        if (!cityRaw) cityRaw = rule.city;
        if (cityRaw === rule.city) {
          district = rule.district;
          break;
        }
      }
    }
  }

  // 4.5. Detect Google Maps S2 cell hex prefix in Takeout / share URLs (e.g. !1s0x3442... = Taipei Basin)
  if (!cityRaw) {
    if (/0x3442[0-9a-f]{4}/i.test(clean)) {
      cityRaw = '台北市';
    } else if (/0x346[89][0-9a-f]{4}/i.test(clean)) {
      cityRaw = '台中市';
    } else if (/0x345d[0-9a-f]{4}/i.test(clean)) {
      cityRaw = '桃園市';
    }
  }

  // 5. Verify coordinates if available (resolves both city and nearest district!)
  if (coords && !isNaN(coords.lat) && !isNaN(coords.lng)) {
    const { lat, lng } = coords;
    if (!cityRaw) {
      if (lat >= 22.88 && lat <= 23.42 && lng >= 120.0 && lng <= 120.65) {
        cityRaw = '台南市';
      } else if (
        lat >= 22.45 &&
        lat <= 22.88 &&
        lng >= 120.15 &&
        lng <= 120.8
      ) {
        cityRaw = '高雄市';
      } else if (lat >= 24.95 && lat <= 25.3 && lng >= 121.4 && lng <= 121.7) {
        cityRaw = '台北市';
      } else if (
        lat >= 24.05 &&
        lat <= 24.45 &&
        lng >= 120.45 &&
        lng <= 120.9
      ) {
        cityRaw = '台中市';
      } else if (lat >= 35.5 && lat <= 35.85 && lng >= 139.5 && lng <= 140.0) {
        return {
          country: '日本',
          city: '東京都',
          district: district || '台東區',
        };
      }
    }

    if (!district) {
      let bestDist = '';
      let minMeters = Infinity;
      for (const c of DISTRICT_CENTROIDS) {
        if (cityRaw && c.city !== cityRaw) continue;
        const d = calculateDistanceMeters(lat, lng, c.lat, c.lng);
        if (d < minMeters && d <= 8000) {
          minMeters = d;
          bestDist = c.district;
        }
      }
      if (bestDist) {
        district = bestDist;
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
      嘉義市: '東區',
      宜蘭縣: '礁溪鄉',
      花蓮縣: '花蓮市',
      台東縣: '台東市',
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
  if (/博物館|美術館|展覽|文創|藝術|文化|museum|gallery/.test(lower)) {
    return {
      primary_category: 'museum_culture',
      sub_category: 'museum',
      estimated_stay_mins: 110,
    };
  }
  if (/古蹟|碧山巖|寺|廟|宮|神社|城隍|紀念堂|老街|地標|休閒中心/.test(lower)) {
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
