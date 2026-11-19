/**
 * Smart Place Description / Notes Resolver
 * Automatically resolves meaningful Google Maps-style highlight sentences & descriptions
 * for places imported via CSV / Google Takeout without manual notes.
 */

export interface KnownPlaceDesc {
  keywords: string[];
  city?: string;
  district?: string;
  description: string;
}

export const KNOWN_PLACE_GOOGLE_MAPS_DESCRIPTIONS: KnownPlaceDesc[] = [
  // ================= 台南市 =================
  // 新化區
  {
    keywords: ['阿蓮牛肉湯', '新化阿蓮牛肉湯'],
    city: '台南市',
    district: '新化區',
    description:
      '溫體牛肉新鮮軟嫩、牛肉湯頭鮮美，點湯品即可免費享用美味牛肉燥飯，且湯品可無限續加',
  },
  {
    keywords: ['新化老街'],
    city: '台南市',
    district: '新化區',
    description:
      '日治時期仿巴洛克式立面街屋建築群，歷史文化底蘊深厚，在地特色美食聚集',
  },

  // 南區
  {
    keywords: ['酣呷', 'The Han Jia', 'The Han-Jia'],
    city: '台南市',
    district: '南區',
    description:
      '台南南區人氣創意調酒餐酒館，以電影靈感設計特調與法式精緻下酒菜',
  },
  {
    keywords: ['下林米糕', '下林'],
    city: '台南市',
    district: '南區',
    description:
      '夏林路傳承40餘年老字號米糕，米糕Q彈淋上濃郁肉燥配旗魚鬆與四神湯',
  },
  {
    keywords: ['藍晒圖文創園區', '藍晒圖'],
    city: '台南市',
    district: '南區',
    description:
      '舊司法宿舍群改建文創園區，巨大3D立體藍晒圖與質感特色選物店',
  },

  // 龍崎區
  {
    keywords: ['王家燻羊肉'],
    city: '台南市',
    district: '龍崎區',
    description:
      '台南龍崎在地深山古法稻殼燻羊肉，肉質細嫩無羶味，蒜油麵線必點',
  },

  // 中西區
  {
    keywords: ['阿蓮牛肉湯'],
    city: '台南市',
    district: '中西區',
    description:
      '台南市區熱門溫體牛肉湯，天然蔬果熬煮清甜湯頭，肉質軟嫩配免費牛肉燥飯',
  },
  {
    keywords: ['阿松割包'],
    city: '台南市',
    district: '中西區',
    description: '國華街老字號名店，獨特豬舌包搭配特製特濃花生醬汁，風味絕佳',
  },
  {
    keywords: ['邱家小卷米粉'],
    city: '台南市',
    district: '中西區',
    description: '國華街排隊必吃，新鮮現煮彈牙小卷與自然鮮甜米粉湯',
  },
  {
    keywords: ['矮仔成蝦仁飯'],
    city: '台南市',
    district: '中西區',
    description: '海安路百年老字號，火燒蝦仁搭配半熟鴨蛋與高湯炊飯經典古早味',
  },
  {
    keywords: ['阿明豬心冬粉'],
    city: '台南市',
    district: '中西區',
    description: '保安路米其林必比登推薦，麻油豬心與蒜頭豬腳老字號排隊名店',
  },
  {
    keywords: ['林家白糖粿'],
    city: '台南市',
    district: '中西區',
    description: '國華街傳統銅板古早味點心，現炸熱騰騰白糖粿外脆內軟糯',
  },
  {
    keywords: ['六千泓佐牛肉湯', '六千牛肉湯'],
    city: '台南市',
    district: '中西區',
    description: '海安路清晨排隊秒殺名店，現宰新鮮溫體牛肉第一道鮮甜清湯',
  },
  {
    keywords: ['修安扁擔豆花'],
    city: '台南市',
    district: '中西區',
    description: '國華街手工古法傳統豆花，搭配黑糖粉粿與布丁多層次甜品',
  },
  {
    keywords: ['金得春捲'],
    city: '台南市',
    district: '中西區',
    description: '國華街超過一甲子老字號，餡料飽滿豐富並以微溫鐵板乾烙餅皮',
  },
  {
    keywords: ['富盛號碗粿'],
    city: '台南市',
    district: '中西區',
    description: '國華街近八十年老店，獨家黑豆醬油搭配香菇肉燥古早味碗粿',
  },
  {
    keywords: ['神農街'],
    city: '台南市',
    district: '中西區',
    description: '台南保存最完整清代老街，夜間紅燈籠造景與文青獨立選物小店',
  },
  {
    keywords: ['林百貨'],
    city: '台南市',
    district: '中西區',
    description: '全台唯一保留指針式電梯與頂樓神社的日治時期五層樓仔老百貨',
  },
  {
    keywords: ['赤崁樓', '赤嵌樓'],
    city: '台南市',
    district: '中西區',
    description: '台南代表性國定古蹟，荷治普羅民遮城遺址與九座贔屭御碑',
  },
  {
    keywords: ['臺灣文學館', '台灣文學館'],
    city: '台南市',
    district: '中西區',
    description: '原台南州廳百年馬薩式古典官署建築，展出豐富臺灣文學史料',
  },
  {
    keywords: ['台南市美術館', '臺南市美術館'],
    city: '台南市',
    district: '中西區',
    description: '二館當代五角形清水模幾何建築，頂樓碎形遮陽屋頂與豐富現代展覽',
  },
  {
    keywords: ['清珍鴨肉焿'],
    city: '台南市',
    district: '中西區',
    description: '金華路排隊老字號，羹湯清甜搭配鴨肉切盤與下水料理',
  },
  {
    keywords: ['梅鑫海產'],
    city: '台南市',
    district: '中西區',
    description: '海安路人氣熱炒海鮮老店，生猛海鮮現點現料理，越夜越熱鬧',
  },
  {
    keywords: ['SabiSabi'],
    city: '台南市',
    district: '中西區',
    description: '老屋改建文青咖啡廳，提供手工布丁與特色風味甜點咖啡',
  },
  {
    keywords: ['赫玖'],
    city: '台南市',
    district: '中西區',
    description: '老宅氛圍質感調酒吧與選物空間，夜晚微醺放鬆好去處',
  },
  {
    keywords: ['德記古早味汕頭豆花'],
    city: '台南市',
    district: '中西區',
    description: '古法手作綿密豆花，搭配古早味黑糖糖水清甜爽口',
  },
  {
    keywords: ['阿堂鹹粥'],
    city: '台南市',
    district: '中西區',
    description: '西門路圓環老字號虱目魚鹹粥，料多味美煎魚肚與鮮甜湯頭',
  },
  {
    keywords: ['武聖夜市'],
    city: '台南市',
    district: '中西區',
    description: '台南歷史悠久在地人氣夜市，地瓜球、排骨酥與特色小吃聚集',
  },
  {
    keywords: ['西市場', '大菜市', '西門市場'],
    city: '台南市',
    district: '中西區',
    description: '台南百年市定古蹟大菜市，日治時期經典木構洋樓建築，匯集傳統老字號甜品冰品與正興街文創商圈',
  },

  // 安平區
  {
    keywords: ['文章牛肉湯'],
    city: '台南市',
    district: '安平區',
    description: '安平人氣溫體牛肉湯排隊名店，牛肉鮮嫩現涮搭配牛肉燥飯',
  },
  {
    keywords: ['安平古堡'],
    city: '台南市',
    district: '安平區',
    description: '荷蘭統治時期熱蘭遮城古蹟，登古堡瞭望台遠眺安平夕陽港灣',
  },
  {
    keywords: ['安平樹屋'],
    city: '台南市',
    district: '安平區',
    description: '百年老榕樹氣根盤根錯節包覆舊德記洋行倉庫，奇幻空中木棧步道',
  },

  // 北區
  {
    keywords: ['連得堂煎餅'],
    city: '台南市',
    district: '北區',
    description: '北區崇安街百年老店，古法炭火圓烤盤手作限量味噌與雞蛋煎餅',
  },
  {
    keywords: ['花園夜市'],
    city: '台南市',
    district: '北區',
    description: '台南規模最大知名觀光夜市，旗海飄揚集結百攤在地特色小吃美食',
  },

  // 東區
  {
    keywords: ['大東夜市'],
    city: '台南市',
    district: '東區',
    description: '台南東區經典排隊夜市，集結各色在地特色點心與異國人氣美食',
  },

  // 麻豆區
  {
    keywords: ['總爺藝文中心', '總爺糖廠', '總爺', '麻豆總爺'],
    city: '台南市',
    district: '麻豆區',
    description: '明治製糖總爺工場古蹟建築群，綠意林蔭樟樹大道與紅磚洋樓工藝展館，漫步散心與賞析當代藝術展覽好去處',
  },

  // ================= 高雄市 =================
  // 鹽埕區
  {
    keywords: ['大溝頂虱目魚', '虱目魚米粉湯'],
    city: '高雄市',
    district: '鹽埕區',
    description: '鹽埕公有市場人氣鮮魚肚漿湯與魚皮湯，在地老饕推薦傳統早餐',
  },
  {
    keywords: ['銀座聚場', 'Takao Ginza'],
    city: '高雄市',
    district: '鹽埕區',
    description: '高雄第一座百貨拱廊改建老屋咖啡館，招牌焦糖昭和布丁與手沖咖啡',
  },
  {
    keywords: ['港園牛肉麵'],
    city: '高雄市',
    district: '鹽埕區',
    description: '鹽埕六十年老店，必點招牌牛肉拌麵與豬腳拌麵配滿滿蒜泥',
  },
  {
    keywords: ['鴨肉珍'],
    city: '高雄市',
    district: '鹽埕區',
    description: '米其林必比登推薦，超人氣鴨肉飯、肉燥飯配現煮下水湯',
  },
  {
    keywords: ['駁二藝術特區', '駁二'],
    city: '高雄市',
    district: '鹽埕區',
    description: '高雄舊港口倉庫群當代藝術特區，大港橋夕陽與大型戶外裝置藝術',
  },
  {
    keywords: ['高雄市立歷史博物館'],
    city: '高雄市',
    district: '鹽埕區',
    description: '日治時期高雄市役所歷史建築，常設展出高雄城市歷史人文記憶',
  },
  {
    keywords: ['永和小籠湯包'],
    city: '高雄市',
    district: '鹽埕區',
    description: '鹽埕三十年老字號排隊名店，皮薄多汁現包現蒸手工小籠湯包',
  },
  {
    keywords: ['鴨肉本'],
    city: '高雄市',
    district: '鹽埕區',
    description: '富野路老字號鴨肉名店，煙燻鴨肉嫩口、當歸鴨湯頭溫潤回甘',
  },
  {
    keywords: ['王家甜湯之家'],
    city: '高雄市',
    district: '鹽埕區',
    description: '傳承三代金黃手工豆花，黑糖甜香古早味傳統甜品',
  },
  {
    keywords: ['李家圓仔冰'],
    city: '高雄市',
    district: '鹽埕區',
    description: '鹽埕第一公有市場老攤，手工現煮軟Q圓仔與古早味八寶冰',
  },
  {
    keywords: ['樺達奶茶'],
    city: '高雄市',
    district: '鹽埕區',
    description: '鹽埕發跡奶茶元祖老店，普洱加紅茶調和鮮奶經典古早味比例',
  },
  {
    keywords: ['双妃奶茶'],
    city: '高雄市',
    district: '鹽埕區',
    description: '鹽埕新樂街奶茶一條街名店，免費加珍珠茶香濃郁順口',
  },
  {
    keywords: ['研咖啡'],
    city: '高雄市',
    district: '鹽埕區',
    description: '鹽埕小巷獨立精品咖啡館，自選單品手沖與巴斯克乳酪蛋糕',
  },
  {
    keywords: ['元町東京黑咖哩'],
    city: '高雄市',
    district: '鹽埕區',
    description: '大智街日式熟成黑咖哩，濃郁香料醬汁搭配酥脆炸豬排',
  },
  {
    keywords: ['鹽埕廣東汕頭牛肉麵'],
    city: '高雄市',
    district: '鹽埕區',
    description: '溫體牛肉熬煮清甜湯頭，手工拉麵彈牙配特製沙茶牛肉',
  },
  {
    keywords: ['堀江麵'],
    city: '高雄市',
    district: '鹽埕區',
    description: '鹽埕五十年老麵攤，意麵拌香濃肉燥配現切黑白切滷味',
  },
  {
    keywords: ['老蔡虱目魚粥'],
    city: '高雄市',
    district: '鹽埕區',
    description: '瀨南街清晨傳統早餐，新鮮煎虱目魚肚與鮮美魚丸湯',
  },

  // 鼓山區
  {
    keywords: ['內惟藝術中心'],
    city: '高雄市',
    district: '鼓山區',
    description: '純白波浪建築結合藝術展覽、修復中心與文青輕食咖啡館',
  },
  {
    keywords: ['棧貳庫', 'KW2'],
    city: '高雄市',
    district: '鼓山區',
    description: '百年歷史高雄港邊紅磚倉庫，純白旋轉木馬與特色文創餐飲',
  },
  {
    keywords: ['壽山觀景台', '壽山忠烈祠'],
    city: '高雄市',
    district: '鼓山區',
    description: '高雄知名夜景聖地，忠烈祠旁LOVE觀景地標俯瞰高雄港全景',
  },
  {
    keywords: ['哈瑪星鐵道文化園區'],
    city: '高雄市',
    district: '鼓山區',
    description: '舊打狗驛百年鐵道遺跡，廣闊草坪風箏與蒸汽火車頭陳列',
  },
  {
    keywords: ['舊打狗驛故事館'],
    city: '高雄市',
    district: '鼓山區',
    description: '全台首座鐵道資料故事館，重現早期站房售票口與調度辦公室',
  },
  {
    keywords: ['西子灣觀景平台', '西子灣'],
    city: '高雄市',
    district: '鼓山區',
    description: '全台最美夕陽打卡勝地，傍晚吹海風看大船入港海天一色',
  },
  {
    keywords: ['打狗英國領事館'],
    city: '高雄市',
    district: '鼓山區',
    description: '清末巴洛克風格紅磚洋樓，依山傍海俯瞰高雄港最佳視野',
  },
  {
    keywords: ['雄鎮北門'],
    city: '高雄市',
    district: '鼓山區',
    description: '清代海防砲台古蹟，扼守旗後海峽險要咽喉要塞',
  },
  {
    keywords: ['新濱・駅前', '新濱駅前'],
    city: '高雄市',
    district: '鼓山區',
    description: '舊三和銀行改建日式老銀行咖啡館，復古摩登氛圍與冰滴咖啡',
  },
  {
    keywords: ['春田茶室'],
    city: '高雄市',
    district: '鼓山區',
    description: '四層樓歷史洋樓茶空間，俯瞰哈瑪星街景享用精緻冷泡茶與茶點',
  },

  // 旗津區
  {
    keywords: ['旗津天后宮'],
    city: '高雄市',
    district: '旗津區',
    description: '高雄歷史最悠久的媽祖廟，香火鼎盛鄰近旗津老街海鮮街',
  },
  {
    keywords: ['旗津星空隧道'],
    city: '高雄市',
    district: '旗津區',
    description: '穿越旗後山海景步道木棧隧道，通往壯闊高雄港外海峽灣視野',
  },
  {
    keywords: ['正家興波士頓蛋糕', '正家興'],
    city: '高雄市',
    district: '旗津區',
    description: '旗津老街人氣排隊伴手禮，蓬鬆柔軟波士頓派綿密鮮奶油',
  },
  {
    keywords: ['錦記手工地瓜酥', '錦記'],
    city: '高雄市',
    district: '旗津區',
    description: '旗津知名現炸地瓜酥伴手禮，薄脆裹蜜糖酥脆不黏牙',
  },

  // 新興區 / 前金區 / 苓雅區 / 前鎮區
  {
    keywords: ['不二緻果', '高雄不二家'],
    city: '高雄市',
    district: '新興區',
    description: '高雄超人氣真芋頭蛋糕與拿破崙派伴手禮名店',
  },
  {
    keywords: ['興隆居'],
    city: '高雄市',
    district: '前金區',
    description: '六合二路超人氣排隊早餐老店，招牌爆漿湯汁傳統手工湯包',
  },
  {
    keywords: ['御書房生活藝術空間', '御書房'],
    city: '高雄市',
    district: '苓雅區',
    description: '高雄藝文界聚會長青樹，木質調溫馨餐飲與人文選書空間',
  },
  {
    keywords: ['鈴鹿賽道樂園', 'SKM Park'],
    city: '高雄市',
    district: '前鎮區',
    description: '日本鈴鹿賽道海外唯一授權卡丁車主題樂園，刺激賽車體驗',
  },

  // ================= 台北市 =================
  {
    keywords: ['某咖啡', 'Mau Coffee'],
    city: '台北市',
    district: '中山區',
    description: '中山區質感自家烘焙手沖咖啡店，店內氛圍安靜適合品飲咖啡',
  },
  {
    keywords: ['The Slice Shop'],
    city: '台北市',
    district: '大安區',
    description: '大安區人氣紐約街頭美式披薩切片專賣，餅皮酥脆配料豐富',
  },
  {
    keywords: ['元意餐廳'],
    city: '台北市',
    district: '大安區',
    description: '大安區精緻義式私房料理，道地手工麵食與經典前菜',
  },
  {
    keywords: ['鼎泰豐'],
    city: '台北市',
    description: '米其林推薦享譽國際小籠包名店，黃金十八摺現蒸湯汁濃郁鮮甜',
  },
  {
    keywords: ['阜杭豆漿'],
    city: '台北市',
    district: '中正區',
    description: '華山市場超人氣排隊早餐，厚燒餅夾油條配香濃鹹豆漿',
  },
  {
    keywords: ['大稻埕迪化街', '迪化街'],
    city: '台北市',
    district: '大同區',
    description: '百年中藥南北貨老街與巴洛克建築，文創新聚落與霞海城隍廟',
  },
  {
    keywords: ['華山1914'],
    city: '台北市',
    district: '中正區',
    description: '舊酒廠改建文化創意產業園區，多檔藝文展覽、文創市集與風格餐廳',
  },
];

/**
 * Dynamically resolves a Google Maps-style highlight description based on store name,
 * matched landmarks, category, and district.
 * STRICT: Ensures that district-specific stores (e.g. 阿蓮牛肉湯 in 新化區) never receive
 * cross-district descriptions from other branches (e.g. 國華街 in 中西區).
 */
export function resolvePlaceDescription(
  name: string,
  city = '台南市',
  district = '',
  subCategory = '',
  address = ''
): string {
  const clean = (name || '').trim();
  if (!clean) return 'Google Maps 在地精選推薦景點';

  // 1. Strict match: keywords + city + district
  if (district) {
    for (const item of KNOWN_PLACE_GOOGLE_MAPS_DESCRIPTIONS) {
      if (item.district && item.district !== district) continue;
      if (item.city && city && item.city !== city) continue;
      if (
        item.keywords.some((kw) =>
          clean.toLowerCase().includes(kw.toLowerCase())
        )
      ) {
        return item.description;
      }
    }
  }

  // 2. Loose match: keywords + city (only for templates without district constraints)
  for (const item of KNOWN_PLACE_GOOGLE_MAPS_DESCRIPTIONS) {
    if (item.district) continue; // Skip district-specific templates in loose pass to prevent cross-district pollution
    if (item.city && city && item.city !== city) continue;
    if (
      item.keywords.some((kw) =>
        clean.toLowerCase().includes(kw.toLowerCase())
      )
    ) {
      return item.description;
    }
  }

  // 3. Dynamic synthesis based on food / place keywords in the name
  const lower = clean.toLowerCase();

  // 餐酒 / 酒吧
  if (/餐酒|酒吧|bistro|bar|居酒屋|串燒|啤酒|調酒|酉/.test(lower)) {
    return `${city}${district ? '・' + district : ''}人氣餐酒酒吧，以特色調酒與創意下酒料理聞名，適合微醺小酌與朋友聚餐`;
  }

  // 咖啡 / 甜點 / 冰品
  if (
    /咖啡|cafe|coffee|甜點|布丁|蛋糕|bakery|烘焙|冰|豆花|泡芙|下午茶|茶飲|奶茶|甘味/.test(
      lower
    )
  ) {
    return `${city}${district ? '・' + district : ''}人氣質感下午茶與甜點咖啡店，提供手作精緻甜品與香醇飲品，適合悠閒小憩`;
  }

  // 牛肉湯 / 羊肉 / 溫體牛
  if (/牛肉湯|溫體牛|燻羊肉|羊肉爐|涮牛肉/.test(clean)) {
    return `${city}${district ? '・' + district : ''}在地排隊溫體牛肉／羊肉老店，牛肉新鮮軟嫩、湯頭鮮美，老饕必點`;
  }

  // 米粿 / 肉粿 / 碗粿 / 割包 / 飯糰 / 潤餅 / 春捲
  if (/米粿|肉粿|九層粿|碗粿|割包|刈包|蝦仁飯|肉粽|油飯|鹹粥|潤餅|春捲/.test(clean)) {
    return `${city}${district ? '・' + district : ''}傳承在地傳統古早味手作名點，香氣濃郁口感紮實，在地老字號經典美味`;
  }

  // 鱔魚意麵 / 鍋燒意麵 / 牛肉麵 / 麵食 / 拉麵
  if (/鱔魚|意麵|鍋燒|牛肉麵|拉麵|米粉|麵線|麵館|冬粉|刀削麵|烏龍麵|蕎麥麵/.test(clean)) {
    return `${city}${district ? '・' + district : ''}在地排隊人氣麵食名攤，麵條Q彈有勁搭配香濃精熬湯頭，老饕必點`;
  }

  // 水餃 / 煎餃 / 小籠包 / 湯包 / 餡餅
  if (/水餃|煎餃|鍋貼|小籠包|湯包|餡餅|生煎包|蒸餃/.test(clean)) {
    return `${city}${district ? '・' + district : ''}人氣現包現蒸手工麵點名店，皮薄多汁餡料飽滿，入口滿溢濃郁鮮甜高湯`;
  }

  // 豆花 / 冰品 / 甜品 / 綠豆湯 / 八寶冰
  if (/豆花|挫冰|刨冰|雪花冰|綠豆湯|紅豆湯|八寶冰|圓仔冰|仙草|愛玉/.test(clean)) {
    return `${city}${district ? '・' + district : ''}傳承古法手工古早味甜品冰店，料多實在清甜爽口，消暑解膩首選`;
  }

  // 早餐 / 蛋餅 / 燒餅 / 豆漿
  if (/早餐|早點|蛋餅|燒餅|豆漿|飯糰|吐司/.test(clean)) {
    return `${city}${district ? '・' + district : ''}超人氣在地傳統排隊早餐店，招牌現做熱騰騰早點，開啟美好一日活力`;
  }

  // 炭烤 / 串燒 / 鹹酥雞 / 炸雞 / 燒肉
  if (/炭烤|串燒|鹹酥雞|炸雞|雞排|燒肉|烤肉|燒烤/.test(clean)) {
    return `${city}${district ? '・' + district : ''}在地熱門宵夜與聚會首選，現點現烤現炸香氣撲鼻，外酥內嫩多汁過癮`;
  }

  // 圖書館 / 書店 / 選物店 / 文創空間
  if (/圖書館|書店|選物|文創|藝文|空間|手作/.test(clean)) {
    return `${city}${district ? '・' + district : ''}充滿人文質感生活空間，氛圍舒適且設計別緻，適合靜心沉澱與尋寶探索`;
  }

  // 伴手禮 / 名產 / 餅店
  if (/伴手禮|名產|餅店|糕餅|鳳梨酥|禮盒|特產/.test(clean)) {
    return `${city}${district ? '・' + district : ''}人氣特色名產伴手禮名店，送禮自用兩相宜，在地口碑推薦`;
  }

  // 博物館 / 美術館 / 展覽
  if (/博物館|美術館|展覽|文化園區|藝術中心|紀念館|故事館/.test(clean)) {
    return `${city}${district ? '・' + district : ''}文化與藝術深度漫遊地標，建築極具特色且展覽內容豐富好逛`;
  }

  // 古蹟 / 歷史建築 / 老街
  if (/古蹟|城堡|古堡|老街|古厝|砲台|燈塔|神社|寺|廟/.test(clean)) {
    return `${city}${district ? '・' + district : ''}重要歷史文化探訪景點，漫步感受深厚人文底蘊與百年古風建築`;
  }

  // 自然步道 / 公園 / 海岸 / 觀景台
  if (/步道|公園|森林|風景區|海灘|海景|觀景台|瀑布|吊橋/.test(clean)) {
    return `${city}${district ? '・' + district : ''}綠意戶外踏青與觀景好去處，視野開闊空氣清新，散步休憩首選`;
  }

  // 4. Fallback based on category
  if (subCategory === 'snack_dessert') {
    return `${city}在地好評推薦甜點咖啡，適合放鬆品味香甜午後`;
  }
  if (subCategory === 'museum' || subCategory === 'landmark') {
    return `${city}知名文化歷史景觀，深度體驗在地故事與美景`;
  }
  if (subCategory === 'trail') {
    return `${city}戶外自然放鬆步道，適合悠閒散步拍照`;
  }

  return `${city}${district ? '・' + district : ''} Google Maps 在地高評價推薦熱點，深獲旅人與老饕喜愛`;
}
