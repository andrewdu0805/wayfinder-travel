'use client';

import React, { useMemo, useState, useSyncExternalStore } from 'react';
import {
  Clock,
  Dices,
  ExternalLink,
  Loader2,
  LocateFixed,
  MapPin,
  Navigation,
  Plus,
  Settings,
  Utensils,
} from 'lucide-react';
import { usePlaces } from '@/context/PlacesContext';
import {
  ALL_TAIWAN_CITY_DISTRICTS,
  calculateDistanceMeters,
  estimateTravelMins,
  extractRegionFromAddress,
} from '@/lib/geo-utils';
import { getWeekdayHoursSummary } from '@/lib/opening-hours';
import { CategoryConfig, SavedPlace } from '@/types/place';

/**
 * 'all' or a `sub_category` id taken directly from `categoryConfigs`
 * (1:1 identical to 地點清單's category filter).
 */
export type CravingType = string;

interface CravingOption {
  id: CravingType;
  emoji: string;
  label: string;
  subLabel: string;
}

const EMOJI_BY_SUB_CATEGORY: Record<string, string> = {
  meal: '🍜',
  snack_dessert: '🍮',
  souvenir: '🎁',
  bar: '🍸',
};

const EMOJI_BY_ICON: Record<string, string> = {
  Utensils: '🍜',
  Coffee: '☕',
  Gift: '🎁',
  Wine: '🍸',
  Beer: '🍺',
  IceCream: '🍦',
  Cake: '🍰',
  Pizza: '🍕',
  Soup: '🍲',
  Sandwich: '🥪',
  CupSoda: '🧋',
  Flame: '🔥',
};

function emojiForConfig(cfg: CategoryConfig): string {
  if (EMOJI_BY_SUB_CATEGORY[cfg.sub_category]) {
    return EMOJI_BY_SUB_CATEGORY[cfg.sub_category];
  }
  const label = cfg.sub_label || '';
  if (/飲料|手搖|奶茶|茶飲|果汁/.test(label)) return '🧋';
  if (/咖啡|早午餐|下午茶/.test(label)) return '☕';
  if (/燒烤|燒肉|串燒|烤肉|居酒屋/.test(label)) return '🔥';
  if (/火鍋|鍋物|湯/.test(label)) return '🍲';
  if (/甜點|點心|冰|蛋糕|麵包|烘焙/.test(label)) return '🍰';
  if (/酒|小酌|微醺|夜生活/.test(label)) return '🍸';
  if (/宵夜|消夜/.test(label)) return '🌙';
  if (/伴手禮|名產|禮盒/.test(label)) return '🎁';
  return EMOJI_BY_ICON[cfg.icon_name] || '🍴';
}

function isFoodPlace(p: SavedPlace, diningSubSet: Set<string>): boolean {
  if (p.visit_status === 'visited_skip') return false;
  // Strictly match dining places from 地點清單 (never pull landmarks, museums, parks, or non-food shopping)
  return (
    p.primary_category === 'restaurant' || diningSubSet.has(p.sub_category)
  );
}

function matchesCraving(
  p: SavedPlace,
  craving: CravingType,
  diningSubSet: Set<string>
): boolean {
  if (!isFoodPlace(p, diningSubSet)) return false;
  if (craving === 'all') return true;
  // 1:1 with 地點清單: a place belongs to the exact sub_category selected on its card
  return p.sub_category === craving;
}

interface EatNowWidgetProps {
  defaultCity: string;
  defaultDistrict: string;
  activeDayOfWeek?: number | null;
  onAddPlaceToItinerary?: (place: SavedPlace) => void;
  onOpenSettingsModal?: () => void;
}

const subscribeNoop = () => () => {};
const getClientDayOfWeek = () => new Date().getDay();
const getServerDayOfWeek = (): number | null => null;

export function EatNowWidget({
  defaultCity,
  defaultDistrict,
  activeDayOfWeek,
  onAddPlaceToItinerary,
  onOpenSettingsModal,
}: EatNowWidgetProps) {
  const { places, categoryConfigs, updatePlaceInline } = usePlaces();

  const [isOpen, setIsOpen] = useState(false);
  const [manualCity, setManualCity] = useState<string | null>(null);
  const [manualDistrict, setManualDistrict] = useState<string | null>(null);
  const [craving, setCraving] = useState<CravingType>('all');
  const [userCoords, setUserCoords] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locateMessage, setLocateMessage] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [addedFeedbackId, setAddedFeedbackId] = useState<string | null>(null);
  const todayDow = useSyncExternalStore(
    subscribeNoop,
    getClientDayOfWeek,
    getServerDayOfWeek
  );

  const effectiveDayOfWeek =
    typeof activeDayOfWeek === 'number' ? activeDayOfWeek : todayDow;

  const city = manualCity ?? (defaultCity || '高雄市');
  const district =
    manualCity !== null
      ? manualDistrict ?? 'ALL'
      : manualDistrict ?? (defaultDistrict || 'ALL');

  // Dining sub-categories shared 1:1 with 地點清單 & 分類設定
  const diningConfigs = useMemo(
    () =>
      categoryConfigs
        .filter((cfg) => cfg.primary_category === 'restaurant')
        .sort((a, b) => a.sort_order - b.sort_order),
    [categoryConfigs]
  );

  const diningSubSet = useMemo(
    () => new Set(diningConfigs.map((c) => c.sub_category)),
    [diningConfigs]
  );

  const effectiveCraving =
    craving === 'all' || diningSubSet.has(craving) ? craving : 'all';

  // Scoped food places in the currently selected city (+ district if specified) for live pill counts
  const scopedRegionFoodPlaces = useMemo(
    () =>
      places.filter(
        (p) =>
          p.city === city &&
          (district === 'ALL' || p.district === district) &&
          isFoodPlace(p, diningSubSet)
      ),
    [places, city, district, diningSubSet]
  );

  const cravingOptions: CravingOption[] = useMemo(() => {
    const options: CravingOption[] = [
      {
        id: 'all',
        emoji: '🍽️',
        label: '全部美食',
        subLabel: `${scopedRegionFoodPlaces.length} 間收藏`,
      },
    ];

    for (const cfg of diningConfigs) {
      const count = scopedRegionFoodPlaces.filter(
        (p) => p.sub_category === cfg.sub_category
      ).length;
      options.push({
        id: cfg.sub_category,
        emoji: emojiForConfig(cfg),
        label: cfg.sub_label,
        subLabel: `${count} 間收藏`,
      });
    }

    return options;
  }, [diningConfigs, scopedRegionFoodPlaces]);

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
            const bdcDist = String(bdc.locality || '')
              .replace('臺', '台')
              .trim();
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

        if (resolvedCity) setManualCity(resolvedCity);
        if (resolvedDist) setManualDistrict(resolvedDist);
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
      (p) =>
        p.city === city && matchesCraving(p, effectiveCraving, diningSubSet)
    );

    const sortFoodList = (list: SavedPlace[]) => {
      return [...list].sort((a, b) => {
        // Put places open on effectiveDayOfWeek ahead of explicitly closed places
        if (effectiveDayOfWeek !== null && effectiveDayOfWeek !== undefined) {
          const aClosed = getWeekdayHoursSummary(
            a.opening_hours_json,
            effectiveDayOfWeek
          ).isClosed;
          const bClosed = getWeekdayHoursSummary(
            b.opening_hours_json,
            effectiveDayOfWeek
          ).isClosed;
          if (aClosed !== bClosed) return aClosed ? 1 : -1;
        }

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
      return { exactMatches: sortFoodList(cityFood), nearbyMatches: [] };
    }

    const inDist = sortFoodList(cityFood.filter((p) => p.district === district));
    const otherDist =
      inDist.length < 3
        ? sortFoodList(cityFood.filter((p) => p.district !== district)).slice(
            0,
            6
          )
        : [];

    return { exactMatches: inDist, nearbyMatches: otherDist };
  }, [
    places,
    city,
    district,
    effectiveCraving,
    diningSubSet,
    userCoords,
    effectiveDayOfWeek,
  ]);

  const activeCravingObj =
    cravingOptions.find((c) => c.id === effectiveCraving) || cravingOptions[0];

  const handleRandomPick = () => {
    const pool = exactMatches.length > 0 ? exactMatches : nearbyMatches;
    if (pool.length === 0) return;
    const openPool =
      effectiveDayOfWeek !== null && effectiveDayOfWeek !== undefined
        ? pool.filter(
            (p) =>
              !getWeekdayHoursSummary(p.opening_hours_json, effectiveDayOfWeek)
                .isClosed
          )
        : pool;
    const targetPool = openPool.length > 0 ? openPool : pool;
    const randomPlace =
      targetPool[Math.floor(Math.random() * targetPool.length)];
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
    const hoursSummary = getWeekdayHoursSummary(
      p.opening_hours_json,
      effectiveDayOfWeek
    );

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
            : hoursSummary.isClosed
            ? 'border-stone-200 bg-stone-50/80 opacity-80'
            : 'border-stone-200 bg-white hover:border-amber-300'
        }`}
      >
        <div className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5 mb-1">
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

                {/* Inline category selector synced 1:1 with 地點清單 */}
                <select
                  aria-label={`${p.name} 飲食分類`}
                  value={p.sub_category}
                  onChange={(e) => {
                    const nextSub = e.target.value;
                    if (nextSub === '__OPEN_SETTINGS__') {
                      onOpenSettingsModal?.();
                      return;
                    }
                    const cfg = categoryConfigs.find(
                      (c) => c.sub_category === nextSub
                    );
                    if (cfg) {
                      updatePlaceInline(p.id, {
                        primary_category: cfg.primary_category,
                        sub_category: cfg.sub_category,
                        estimated_stay_mins: cfg.default_stay_mins,
                      });
                    }
                  }}
                  title="點擊可直接修改此店家的分類（與地點清單同步）"
                  className="rounded-full border border-amber-200 bg-amber-50/80 px-2 py-0.5 text-[11px] font-extrabold text-amber-900 hover:bg-amber-100 focus:outline-none cursor-pointer max-w-[9.5rem] truncate"
                >
                  {categoryConfigs.map((cfg) => (
                    <option key={cfg.id} value={cfg.sub_category}>
                      🏷️ {cfg.sub_label}
                    </option>
                  ))}
                  {onOpenSettingsModal && (
                    <option value="__OPEN_SETTINGS__">
                      ➕ 新增／管理自訂分類...
                    </option>
                  )}
                </select>

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

          {hoursSummary.text && (
            <p
              className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                hoursSummary.isClosed ? 'text-rose-600' : 'text-stone-500'
              }`}
            >
              <Clock
                className={`h-3 w-3 shrink-0 ${
                  hoursSummary.isClosed ? 'text-rose-500' : 'text-amber-600'
                }`}
              />
              <span className="truncate">{hoursSummary.text}</span>
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

  const categorySummaryText = diningConfigs.map((c) => c.sub_label).join('、');

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
            <h2 className="text-lg sm:text-xl font-extrabold text-stone-900 leading-snug flex flex-wrap items-center gap-2">
              <span>🍽️ 現在想吃什麼？</span>
              <span className="text-xs font-bold rounded-full bg-teal-100 text-teal-800 px-2 py-0.5">
                {city}
                {district !== 'ALL' ? `・${district}` : '全區'}
              </span>
            </h2>
            <p className="text-xs sm:text-sm font-bold text-stone-500">
              與「地點清單」飲食分類同步：{categorySummaryText || '餐廳與飲食'}
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

          {onOpenSettingsModal && (
            <button
              type="button"
              onClick={onOpenSettingsModal}
              title="新增或管理飲食分類（與地點清單共用）"
              className="inline-flex items-center gap-1 rounded-xl border-2 border-stone-300 bg-white px-2.5 py-2 text-xs sm:text-sm font-extrabold text-stone-700 hover:bg-stone-50 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Settings className="h-4 w-4 text-stone-500" />
              <span className="hidden sm:inline">飲食分類</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsOpen((v) => !v)}
            className="rounded-xl border-2 border-stone-300 bg-white px-3 py-2 text-xs sm:text-sm font-extrabold text-stone-700 hover:bg-stone-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            {isOpen ? '收合 ▲' : '展開挑選 ▼'}
          </button>
        </div>
      </div>

      {/* Unified Dining Category Pills (1:1 with 地點清單 categoryConfigs!) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {cravingOptions.map((opt) => {
          const isSelected = effectiveCraving === opt.id && isOpen;
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
              <div className="text-xs sm:text-sm font-black leading-tight truncate">
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
                  setManualCity(e.target.value);
                  setManualDistrict('ALL');
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
                  if (manualCity === null) setManualCity(city);
                  setManualDistrict(e.target.value);
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

            <div className="flex flex-wrap items-center gap-2">
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
                {exactMatches.length} 間「{activeCravingObj.label}」收藏店家：
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {exactMatches.map((p) => renderPlaceRow(p, false))}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white/80 p-4 text-center space-y-2">
              <p className="text-sm font-extrabold text-stone-700">
                你的收藏清單中，在「{city}
                {district !== 'ALL' ? `・${district}` : ''}」目前還沒有分類為「
                {activeCravingObj.label}」的店家
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {district !== 'ALL' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (manualCity === null) setManualCity(city);
                      setManualDistrict('ALL');
                    }}
                    className="rounded-xl bg-teal-600 px-3.5 py-1.5 text-xs font-extrabold text-white hover:bg-teal-700 cursor-pointer"
                  >
                    看整個「{city}」的{activeCravingObj.label}
                  </button>
                )}
                {effectiveCraving !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setCraving('all')}
                    className="rounded-xl border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-extrabold text-stone-700 hover:bg-stone-50 cursor-pointer"
                  >
                    改看全部美食分類
                  </button>
                )}
                <a
                  href={gmapsDirectSearchUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-1.5 text-xs font-extrabold text-amber-900 hover:bg-amber-100"
                >
                  <span>
                    🗺️ 直接搜 Google Maps「
                    {district !== 'ALL' ? district : city}{' '}
                    {activeCravingObj.id === 'all'
                      ? '美食'
                      : activeCravingObj.label}
                    」
                  </span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}

          {/* Nearby District Suggestions when exact district has < 3 results */}
          {nearbyMatches.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-stone-200/70">
              <p className="text-xs font-extrabold text-stone-600">
                🧭 鄰近行政區同分類推薦（{city}其他區）：
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
