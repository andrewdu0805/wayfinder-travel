'use client';

import React, { useMemo, useState } from 'react';
import {
  Clock,
  Dices,
  ExternalLink,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Plus,
  Utensils,
} from 'lucide-react';
import { usePlaces } from '@/context/PlacesContext';
import {
  ALL_TAIWAN_CITY_DISTRICTS,
  calculateDistanceMeters,
  estimateTravelMins,
  extractRegionFromAddress,
} from '@/lib/geo-utils';
import { SavedPlace } from '@/types/place';

export type CravingType =
  | 'all'
  | 'meal'
  | 'snack'
  | 'drink'
  | 'bbq'
  | 'bar';

interface CravingOption {
  id: CravingType;
  emoji: string;
  label: string;
  subLabel: string;
}

const CRAVING_OPTIONS: CravingOption[] = [
  { id: 'all', emoji: '🍽️', label: '全部美食', subLabel: '不限類型' },
  { id: 'meal', emoji: '🍜', label: '正餐', subLabel: '飯麵・鍋物・餐廳' },
  { id: 'snack', emoji: '🍮', label: '點心', subLabel: '甜點・冰品・小吃' },
  { id: 'drink', emoji: '🧋', label: '飲料店', subLabel: '手搖・咖啡・茶飲' },
  { id: 'bbq', emoji: '🔥', label: '燒烤', subLabel: '燒肉・串燒・烤雞' },
  { id: 'bar', emoji: '🍸', label: '小酌', subLabel: '餐酒館・精釀・酒吧' },
];

const DRINK_NAME_REGEX =
  /飲料|手搖|奶茶|紅茶|綠茶|烏龍|茶飲|果汁|木瓜牛奶|咖啡|cafe|coffee|拿鐵|冰沙|豆漿|青茶|冬瓜茶|鮮奶茶|茶室|茶館|飲茶|tea|boba/i;
const DRINK_NOTE_REGEX =
  /手搖|奶茶|紅茶|綠茶|烏龍茶|茶飲|果汁|木瓜牛奶|手沖咖啡|精品咖啡|咖啡館|冰滴咖啡|單品咖啡/i;
const BBQ_REGEX =
  /燒烤|烤肉|燒肉|串燒|炭烤|居酒屋|烤雞|桶仔雞|甕仔雞|烤鴨|炭火|bbq|yakitori|poulet|izakaya|串炸/i;
const SNACK_REGEX =
  /點心|甜點|布丁|豆花|蛋糕|烘焙|泡芙|鬆餅|刨冰|剉冰|雪花冰|冰淇淋|冰店|白糖粿|割包|刈包|春捲|潤餅|碗粿|肉粿|米粿|雞蛋糕|車輪餅|蔥油餅|地瓜酥|波士頓派|下午茶|bakery|dessert/i;

function isFoodPlace(p: SavedPlace): boolean {
  if (p.visit_status === 'visited_skip') return false;
  // Strictly respect the place's verified category from 地點清單:
  // Never pull cultural landmarks (e.g. 蝸牛巷), museums, parks, or shopping into food!
  return p.primary_category === 'restaurant';
}

function matchesCraving(p: SavedPlace, craving: CravingType): boolean {
  if (!isFoodPlace(p)) return false;
  if (craving === 'all') return true;
  const nameText = p.name || '';
  const notesText = p.user_notes || '';

  if (craving === 'bar') {
    return p.sub_category === 'bar';
  }
  if (craving === 'drink') {
    // Exclude bars / bistros (which mention 酒精飲品 / 豐富飲品) from 飲料店
    if (p.sub_category === 'bar') return false;
    if (DRINK_NAME_REGEX.test(nameText)) return true;
    return (
      p.sub_category === 'snack_dessert' && DRINK_NOTE_REGEX.test(notesText)
    );
  }
  if (craving === 'bbq') {
    if (BBQ_REGEX.test(nameText)) return true;
    return (
      (p.sub_category === 'meal' || p.sub_category === 'bar') &&
      BBQ_REGEX.test(notesText)
    );
  }
  if (craving === 'snack') {
    if (p.sub_category === 'bar') return false;
    if (DRINK_NAME_REGEX.test(nameText) && !SNACK_REGEX.test(nameText)) {
      return false;
    }
    return p.sub_category === 'snack_dessert' || SNACK_REGEX.test(nameText);
  }
  if (craving === 'meal') {
    return p.sub_category === 'meal';
  }
  return true;
}

interface EatNowWidgetProps {
  defaultCity: string;
  defaultDistrict: string;
  onAddPlaceToItinerary?: (place: SavedPlace) => void;
}

export function EatNowWidget({
  defaultCity,
  defaultDistrict,
  onAddPlaceToItinerary,
}: EatNowWidgetProps) {
  const { places } = usePlaces();

  const [isOpen, setIsOpen] = useState(false);
  const [city, setCity] = useState(defaultCity || '高雄市');
  const [district, setDistrict] = useState(defaultDistrict || 'ALL');
  const [craving, setCraving] = useState<CravingType>('all');
  const [userCoords, setUserCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locateMessage, setLocateMessage] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [addedFeedbackId, setAddedFeedbackId] = useState<string | null>(null);

  // Available cities from saved places + standard Taiwan cities
  const availableCities = useMemo(() => {
    const set = new Set<string>(Object.keys(ALL_TAIWAN_CITY_DISTRICTS));
    places.forEach((p) => {
      if (p.city) set.add(p.city);
    });
    return Array.from(set);
  }, [places]);

  const availableDistricts = useMemo(() => {
    const base = ALL_TAIWAN_CITY_DISTRICTS[city] || [];
    const fromPlaces = places
      .filter((p) => p.city === city && p.district && p.district !== city)
      .map((p) => p.district);
    return Array.from(new Set([...base, ...fromPlaces])).filter(
      (d) => d !== city
    );
  }, [city, places]);

  // GPS locate user's exact current city & district via polygon reverse geocoding
  const handleLocateMe = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocateMessage('此瀏覽器不支援 GPS 定位，請手動選擇縣市與行政區');
      return;
    }
    setIsLocating(true);
    setLocateMessage(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setUserCoords({ lat, lng });

        let resolvedCity = '';
        let resolvedDist = '';

        try {
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=zh`,
            { signal: AbortSignal.timeout(3500) }
          );
          if (res.ok) {
            const bdc = await res.json();
            const bdcCity = String(bdc.principalSubdivision || bdc.city || '')
              .replace('臺', '台')
              .trim();
            const bdcDist = String(bdc.locality || '').replace('臺', '台').trim();
            if (bdcCity && /[市縣]$/.test(bdcCity)) resolvedCity = bdcCity;
            if (
              bdcDist &&
              /[區市鎮鄉]$/.test(bdcDist) &&
              bdcDist !== bdcCity
            ) {
              resolvedDist = bdcDist;
            }
          }
        } catch {
          // fallback below
        }

        if (!resolvedCity || !resolvedDist) {
          const reg = extractRegionFromAddress('', { lat, lng }, city);
          resolvedCity = resolvedCity || reg.city;
          resolvedDist = resolvedDist || reg.district;
        }

        if (resolvedCity) setCity(resolvedCity);
        if (resolvedDist) setDistrict(resolvedDist);
        setLocateMessage(
          `📍 已定位目前所在行政區：${resolvedCity}・${resolvedDist}`
        );
        setIsLocating(false);
        setIsOpen(true);
      },
      () => {
        setLocateMessage('無法取得定位權限，請改用下方選單手動選擇目前行政區');
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  // Matching places in the exact selected district
  const { exactMatches, nearbyMatches } = useMemo(() => {
    const cityFood = places.filter(
      (p) => p.city === city && matchesCraving(p, craving)
    );

    const sortByDistOrRating = (list: SavedPlace[]) => {
      return [...list].sort((a, b) => {
        if (userCoords) {
          const da = calculateDistanceMeters(
            userCoords.lat,
            userCoords.lng,
            a.latitude,
            a.longitude
          );
          const db = calculateDistanceMeters(
            userCoords.lat,
            userCoords.lng,
            b.latitude,
            b.longitude
          );
          return da - db;
        }
        return (b.rating ?? 4.3) - (a.rating ?? 4.3);
      });
    };

    if (district === 'ALL') {
      return { exactMatches: sortByDistOrRating(cityFood), nearbyMatches: [] };
    }

    const inDist = sortByDistOrRating(
      cityFood.filter((p) => p.district === district)
    );
    const otherDist =
      inDist.length < 3
        ? sortByDistOrRating(
            cityFood.filter((p) => p.district !== district)
          ).slice(0, 6)
        : [];

    return { exactMatches: inDist, nearbyMatches: otherDist };
  }, [places, city, district, craving, userCoords]);

  const activeCravingObj =
    CRAVING_OPTIONS.find((c) => c.id === craving) || CRAVING_OPTIONS[0];

  const handleRandomPick = () => {
    const pool = exactMatches.length > 0 ? exactMatches : nearbyMatches;
    if (pool.length === 0) return;
    const randomPlace = pool[Math.floor(Math.random() * pool.length)];
    setPickedId(randomPlace.id);
  };

  const renderPlaceRow = (p: SavedPlace, isNearby = false) => {
    const distM = userCoords
      ? calculateDistanceMeters(
          userCoords.lat,
          userCoords.lng,
          p.latitude,
          p.longitude
        )
      : null;
    const walkMins = distM !== null ? estimateTravelMins(distM, 'WALK') : null;
    const weekdayList = p.opening_hours_json?.weekday_descriptions || [];
    const hoursLabel =
      weekdayList.find((d) => d && !/休息|公休|Closed/i.test(d)) ||
      weekdayList[0] ||
      (p.opening_hours_json?.daily_hours
        ? `${p.opening_hours_json.daily_hours.open}–${p.opening_hours_json.daily_hours.close}`
        : '');

    const isPicked = pickedId === p.id;
    const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      `${p.name} ${p.formatted_address || p.city}`
    )}`;

    return (
      <div
        key={p.id}
        className={`rounded-2xl border-2 p-3.5 transition-all flex flex-col justify-between gap-2.5 ${
          isPicked
            ? 'border-amber-500 bg-amber-50/80 ring-2 ring-amber-300 shadow-sm'
            : 'border-stone-200 bg-white hover:border-amber-300'
        }`}
      >
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                {isPicked && (
                  <span className="inline-flex items-center rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-black text-white">
                    🎲 今日推薦
                  </span>
                )}
                <span className="inline-flex items-center gap-0.5 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-700">
                  <MapPin className="h-3 w-3 text-rose-500" />
                  {p.district || p.city}
                  {isNearby ? '（鄰近）' : ''}
                </span>
                {distM !== null && (
                  <span className="inline-flex items-center rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-bold text-teal-800">
                    {distM < 1000
                      ? `${Math.round(distM)}m`
                      : `${(distM / 1000).toFixed(1)}km`}
                    {walkMins ? `・步行${walkMins}分` : ''}
                  </span>
                )}
              </div>
              <h4 className="text-base font-black text-stone-900 leading-snug">
                {p.name}
              </h4>
            </div>
            {typeof p.rating === 'number' && (
              <span className="shrink-0 rounded-lg bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-black text-amber-800">
                ★ {p.rating.toFixed(1)}
              </span>
            )}
          </div>

          {hoursLabel && (
            <p className="inline-flex items-center gap-1 text-[11px] font-bold text-stone-500">
              <Clock className="h-3 w-3 text-amber-600 shrink-0" />
              <span className="truncate">{hoursLabel}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 pt-1 border-t border-stone-100">
          <a
            href={navUrl}
            target="_blank"
            rel="noreferrer"
            className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-teal-300 bg-teal-50 px-2.5 py-1.5 text-xs font-extrabold text-teal-900 hover:bg-teal-100 transition-colors"
          >
            <Navigation className="h-3.5 w-3.5" />
            <span>導航去吃</span>
            <ExternalLink className="h-3 w-3 opacity-70" />
          </a>

          {onAddPlaceToItinerary && (
            <button
              type="button"
              onClick={() => {
                onAddPlaceToItinerary(p);
                setAddedFeedbackId(p.id);
                setTimeout(() => setAddedFeedbackId(null), 2000);
              }}
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl bg-stone-900 px-2.5 py-1.5 text-xs font-extrabold text-white hover:bg-stone-800 transition-colors cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5 text-amber-400" />
              <span>
                {addedFeedbackId === p.id ? '已加入行程 ✓' : '加入今日行程'}
              </span>
            </button>
          )}
        </div>
      </div>
    );
  };

  const gmapsDirectSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${city}${district !== 'ALL' ? district : ''} ${
      activeCravingObj.id === 'all' ? '美食 餐廳' : activeCravingObj.label
    }`
  )}`;

  return (
    <section className="rounded-3xl border-2 border-teal-400/70 bg-gradient-to-br from-teal-50/70 via-white to-amber-50/50 p-4 sm:p-5 shadow-sm space-y-3.5">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="flex items-center gap-2.5 text-left cursor-pointer group"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-xs shrink-0 group-hover:bg-teal-700 transition-colors">
            <Utensils className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-stone-900 leading-snug flex items-center gap-2">
              <span>🍽️ 現在想吃什麼？</span>
              <span className="text-xs font-bold rounded-full bg-teal-100 text-teal-800 px-2 py-0.5">
                {city}
                {district !== 'ALL' ? `・${district}` : '全區'}
              </span>
            </h2>
            <p className="text-xs sm:text-sm font-bold text-stone-500">
              依目前所在行政區，馬上挑正餐、點心、飲料店、燒烤或小酌
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            id="btn-eat-now-locate"
            type="button"
            disabled={isLocating}
            onClick={handleLocateMe}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs sm:text-sm font-extrabold text-white hover:bg-teal-700 disabled:opacity-50 transition-colors cursor-pointer shadow-xs whitespace-nowrap"
          >
            {isLocating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LocateFixed className="h-4 w-4" />
            )}
            <span>{isLocating ? '定位中...' : '定位目前行政區'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className="rounded-xl border-2 border-stone-300 bg-white px-3 py-2 text-xs sm:text-sm font-extrabold text-stone-700 hover:bg-stone-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            {isOpen ? '收合 ▲' : '展開挑選 ▼'}
          </button>
        </div>
      </div>

      {/* Quick Craving Pills (always visible so user can click in 1 tap!) */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {CRAVING_OPTIONS.map((opt) => {
          const isSelected = craving === opt.id && isOpen;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                setCraving(opt.id);
                setPickedId(null);
                setIsOpen(true);
              }}
              className={`rounded-2xl border-2 px-2.5 py-2 text-center transition-all cursor-pointer ${
                isSelected
                  ? 'border-amber-500 bg-amber-500 text-white shadow-sm'
                  : 'border-stone-200 bg-white text-stone-800 hover:border-amber-400 hover:bg-amber-50/40'
              }`}
            >
              <div className="text-lg leading-none mb-1">{opt.emoji}</div>
              <div className="text-xs sm:text-sm font-black leading-tight">
                {opt.label}
              </div>
              <div
                className={`text-[10px] font-bold mt-0.5 truncate ${
                  isSelected ? 'text-amber-100' : 'text-stone-400'
                }`}
              >
                {opt.subLabel}
              </div>
            </button>
          );
        })}
      </div>

      {/* Expanded Results Panel */}
      {isOpen && (
        <div className="space-y-3 pt-2 border-t border-teal-200/70">
          {/* District selector + Random Pick */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="選擇目前縣市"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setDistrict('ALL');
                  setPickedId(null);
                }}
                className="rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-extrabold text-stone-800 focus:border-teal-600 focus:outline-none cursor-pointer"
              >
                {availableCities.map((c) => (
                  <option key={c} value={c}>
                    📍 {c}
                  </option>
                ))}
              </select>

              <select
                aria-label="選擇目前行政區"
                value={district}
                onChange={(e) => {
                  setDistrict(e.target.value);
                  setPickedId(null);
                }}
                className="rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 text-xs sm:text-sm font-extrabold text-stone-800 focus:border-teal-600 focus:outline-none cursor-pointer"
              >
                <option value="ALL">全部行政區</option>
                {availableDistricts.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              {locateMessage && (
                <span className="text-xs font-bold text-teal-800">
                  {locateMessage}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {(exactMatches.length > 0 || nearbyMatches.length > 0) && (
                <button
                  type="button"
                  onClick={handleRandomPick}
                  className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-extrabold text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer"
                >
                  <Dices className="h-3.5 w-3.5 text-amber-600" />
                  <span>隨機幫我挑一間</span>
                </button>
              )}

              <a
                href={gmapsDirectSearchUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-extrabold text-stone-700 hover:bg-stone-50 transition-colors"
              >
                <span>在 Google Maps 找更多</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          {/* Exact District Matches */}
          {exactMatches.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-extrabold text-teal-900">
                ✨ {city}
                {district !== 'ALL' ? `・${district}` : ''} 找到{' '}
                {exactMatches.length} 間符合「{activeCravingObj.label}」的收藏店家：
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {exactMatches.map((p) => renderPlaceRow(p, false))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white/80 p-4 text-center space-y-2">
              <p className="text-sm font-extrabold text-stone-700">
                你的收藏清單中，在「{city}
                {district !== 'ALL' ? `・${district}` : ''}」目前還沒有「
                {activeCravingObj.label}」店家
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {district !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => setDistrict('ALL')}
                    className="rounded-xl bg-teal-600 px-3.5 py-1.5 text-xs font-extrabold text-white hover:bg-teal-700 cursor-pointer"
                  >
                    看整個「{city}」的{activeCravingObj.label}
                  </button>
                )}
                <a
                  href={gmapsDirectSearchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-1.5 text-xs font-extrabold text-amber-900 hover:bg-amber-100"
                >
                  <span>🗺️ 直接搜 Google Maps「{district !== 'ALL' ? district : city} {activeCravingObj.label}」</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}

          {/* Nearby District Suggestions when exact district has < 3 results */}
          {nearbyMatches.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-stone-200/70">
              <p className="text-xs font-extrabold text-stone-600">
                🧭 鄰近行政區同類型推薦（{city}其他區）：
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {nearbyMatches.map((p) => renderPlaceRow(p, true))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
