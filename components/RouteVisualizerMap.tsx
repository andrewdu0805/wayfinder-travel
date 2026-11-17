'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  Layers,
  Map as MapIcon,
  Navigation,
  Sparkles,
} from 'lucide-react';
import { ItineraryPlan, SavedPlace, VisitStatus } from '@/types/place';
import { usePlaces } from '@/context/PlacesContext';

interface RouteVisualizerMapProps {
  origin: { name: string; latitude: number; longitude: number };
  candidates: SavedPlace[];
  activePlan: ItineraryPlan | null;
  onSelectPlace?: (place: SavedPlace) => void;
}

export function RouteVisualizerMap({
  origin,
  candidates,
  activePlan,
  onSelectPlace,
}: RouteVisualizerMapProps) {
  const { categoryConfigs, updatePlaceInline, settings } = usePlaces();
  const [zoom, setZoom] = useState(1.0);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    activePlan?.stops?.[0]?.place.id || null
  );

  const hasApiKey = Boolean(settings.googleMapsApiKey?.trim());
  const [mapEngine, setMapEngine] = useState<'google' | 'vector'>(
    hasApiKey ? 'google' : 'vector'
  );
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [googleLoadError, setGoogleLoadError] = useState<string | null>(null);

  const googleMapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const stops = activePlan?.stops || [];
  const selectedPlace =
    candidates.find((c) => c.id === selectedPlaceId) ||
    stops.find((s) => s.place.id === selectedPlaceId)?.place ||
    null;

  // Sync selectedPlaceId if plan changes
  useEffect(() => {
    if (stops.length > 0 && !selectedPlaceId) {
      setSelectedPlaceId(stops[0].place.id);
    }
  }, [stops, selectedPlaceId]);

  // Load Google Maps JavaScript API dynamically if API key is provided
  useEffect(() => {
    const apiKey = settings.googleMapsApiKey?.trim();
    if (!apiKey) {
      setIsGoogleLoaded(false);
      setMapEngine('vector');
      return;
    }

    if (typeof window !== 'undefined' && (window as unknown as { google?: { maps?: unknown } }).google?.maps) {
      setIsGoogleLoaded(true);
      setMapEngine('google');
      return;
    }

    const scriptId = 'google-maps-js-sdk';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        setIsGoogleLoaded(true);
        setGoogleLoadError(null);
        setMapEngine('google');
      };
      script.onerror = () => {
        setGoogleLoadError('Google Maps API 載入失敗，已自動切換回向量街區圖');
        setMapEngine('vector');
      };
      document.head.appendChild(script);
    } else {
      setIsGoogleLoaded(true);
      setMapEngine('google');
    }
  }, [settings.googleMapsApiKey]);

  // Render & Update Real Google Maps
  useEffect(() => {
    if (mapEngine !== 'google' || !isGoogleLoaded || !googleMapRef.current) return;
    if (typeof window === 'undefined' || !(window as unknown as { google?: { maps?: typeof google.maps } }).google?.maps) return;

    const gmaps = google.maps;

    // 1. Initialize map instance if not created
    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new gmaps.Map(googleMapRef.current, {
        center: { lat: origin.latitude, lng: origin.longitude },
        zoom: 14,
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
        zoomControl: true,
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'on' }],
          },
        ],
      });
      infoWindowRef.current = new gmaps.InfoWindow();
    }

    const map = mapInstanceRef.current;
    const infoWindow = infoWindowRef.current;

    // 2. Clear old markers and polyline
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }

    const bounds = new gmaps.LatLngBounds();

    // 3. Add Origin Marker
    const originPos = { lat: origin.latitude, lng: origin.longitude };
    bounds.extend(originPos);
    const originMarker = new gmaps.Marker({
      position: originPos,
      map,
      title: `🚩 起點：${origin.name}`,
      icon: {
        path: gmaps.SymbolPath.CIRCLE,
        scale: 12,
        fillColor: '#10b981',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2.5,
      },
      label: {
        text: '🚩',
        fontSize: '13px',
      },
    });
    originMarker.addListener('click', () => {
      infoWindow?.setContent(`
        <div style="font-family:sans-serif; padding:6px; color:#0f172a;">
          <span style="font-size:11px; font-weight:bold; color:#10b981;">行程起點</span>
          <h4 style="font-size:15px; font-weight:900; margin:2px 0;">${origin.name}</h4>
        </div>
      `);
      infoWindow?.open(map, originMarker);
    });
    markersRef.current.push(originMarker);

    // 4. Add Itinerary Stop Markers (1, 2, 3...)
    stops.forEach((stop, idx) => {
      const pos = { lat: stop.place.latitude, lng: stop.place.longitude };
      bounds.extend(pos);

      const isSelected = stop.place.id === selectedPlaceId;
      const marker = new gmaps.Marker({
        position: pos,
        map,
        title: `第 ${idx + 1} 站：${stop.place.name}`,
        zIndex: isSelected ? 999 : 100 + idx,
        icon: {
          path: gmaps.SymbolPath.CIRCLE,
          scale: isSelected ? 16 : 13,
          fillColor: isSelected ? '#e11d48' : '#d97706',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2.5,
        },
        label: {
          text: String(idx + 1),
          color: '#ffffff',
          fontWeight: '900',
          fontSize: isSelected ? '13px' : '11px',
        },
      });

      marker.addListener('click', () => {
        setSelectedPlaceId(stop.place.id);
        onSelectPlace?.(stop.place);
        infoWindow?.setContent(`
          <div style="font-family:sans-serif; padding:6px; color:#0f172a; min-width:180px;">
            <div style="font-size:11px; font-weight:bold; color:#d97706;">第 ${idx + 1} 站 ｜ 停留 ${stop.stay_mins} 分</div>
            <h4 style="font-size:16px; font-weight:900; margin:3px 0; color:#0f172a;">${stop.place.name}</h4>
            <div style="font-size:12px; color:#64748b; margin-bottom:4px;">
              ${stop.arrival_time}–${stop.departure_time} ｜ ★ ${stop.place.rating || 4.5}
            </div>
            <div style="font-size:11px; color:#334155; line-height:1.4;">${stop.ai_reason}</div>
          </div>
        `);
        infoWindow?.open(map, marker);
      });

      markersRef.current.push(marker);
    });

    // 5. Add End-Anchor Marker if present (🚄 高鐵 / 🚆 火車站 / 🏨 飯店)
    if (activePlan?.end_anchor) {
      const endPos = {
        lat: activePlan.end_anchor.latitude,
        lng: activePlan.end_anchor.longitude,
      };
      bounds.extend(endPos);
      const isHsr = activePlan.end_anchor.anchor_type === 'hsr';
      const isTrain = activePlan.end_anchor.anchor_type === 'train';
      const endIconEmoji = isHsr ? '🚄' : isTrain ? '🚆' : '🏨';

      const endMarker = new gmaps.Marker({
        position: endPos,
        map,
        title: `🏁 終點：${activePlan.end_anchor.name}`,
        zIndex: 500,
        icon: {
          path: gmaps.SymbolPath.CIRCLE,
          scale: 14,
          fillColor: '#e11d48',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2.5,
        },
        label: {
          text: endIconEmoji,
          fontSize: '12px',
        },
      });

      endMarker.addListener('click', () => {
        infoWindow?.setContent(`
          <div style="font-family:sans-serif; padding:6px; color:#0f172a;">
            <div style="font-size:11px; font-weight:bold; color:#e11d48;">行程終點站</div>
            <h4 style="font-size:16px; font-weight:900; margin:3px 0;">${activePlan.end_anchor?.name}</h4>
            <div style="font-size:12px; color:#64748b;">${activePlan.end_anchor?.arrival_time} 抵達${activePlan.end_anchor?.return_departure_time ? `（${activePlan.end_anchor.return_departure_time} 發車）` : ''}</div>
          </div>
        `);
        infoWindow?.open(map, endMarker);
      });
      markersRef.current.push(endMarker);
    }

    // 6. Draw Polyline Route
    const routeCoordinates = [
      originPos,
      ...stops.map((s) => ({
        lat: s.place.latitude,
        lng: s.place.longitude,
      })),
    ];
    if (activePlan?.end_anchor) {
      routeCoordinates.push({
        lat: activePlan.end_anchor.latitude,
        lng: activePlan.end_anchor.longitude,
      });
    }

    polylineRef.current = new gmaps.Polyline({
      path: routeCoordinates,
      geodesic: true,
      strokeColor: '#f59e0b',
      strokeOpacity: 0.9,
      strokeWeight: 5,
      map,
    });

    // 7. Adjust bounds
    if (stops.length > 0) {
      map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
    }
  }, [mapEngine, isGoogleLoaded, origin, stops, activePlan?.end_anchor, selectedPlaceId, onSelectPlace]);

  // Coordinate calculations for SVG vector fallback map
  const allPoints = [
    { lat: origin.latitude, lng: origin.longitude },
    ...candidates.map((c) => ({ lat: c.latitude, lng: c.longitude })),
    ...stops.map((s) => ({ lat: s.place.latitude, lng: s.place.longitude })),
  ];

  const centerLat =
    (Math.min(...allPoints.map((p) => p.lat)) +
      Math.max(...allPoints.map((p) => p.lat))) /
    2;
  const centerLng =
    (Math.min(...allPoints.map((p) => p.lng)) +
      Math.max(...allPoints.map((p) => p.lng))) /
    2;

  const spanLat =
    Math.max(
      0.011,
      Math.max(...allPoints.map((p) => p.lat)) -
        Math.min(...allPoints.map((p) => p.lat)) +
        0.005
    ) / zoom;
  const spanLng =
    Math.max(
      0.014,
      Math.max(...allPoints.map((p) => p.lng)) -
        Math.min(...allPoints.map((p) => p.lng)) +
        0.006
    ) / zoom;

  const minLat = centerLat - spanLat / 2;
  const maxLat = centerLat + spanLat / 2;
  const minLng = centerLng - spanLng / 2;
  const maxLng = centerLng + spanLng / 2;

  const width = 680;
  const height = 420;

  const project = (lat: number, lng: number) => {
    const x =
      ((lng - minLng) / Math.max(0.0001, maxLng - minLng)) * (width - 70) + 35;
    const y =
      height -
      (((lat - minLat) / Math.max(0.0001, maxLat - minLat)) * (height - 70) +
        35);
    return { x, y };
  };

  const originPt = project(origin.latitude, origin.longitude);
  const stopPoints = stops.map((s) => ({
    stop: s,
    ...project(s.place.latitude, s.place.longitude),
  }));

  const polylinePoints = [
    `${originPt.x},${originPt.y}`,
    ...stopPoints.map((p) => `${p.x},${p.y}`),
  ].join(' ');

  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-900 text-stone-100 overflow-hidden shadow-xs space-y-0">
      {/* Map Header with Engine Switcher (Google Maps vs Vector) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-stone-800 bg-stone-950/80">
        <div className="flex items-center gap-2">
          {mapEngine === 'google' ? (
            <MapIcon className="h-5 w-5 text-teal-400 shrink-0" />
          ) : (
            <Navigation className="h-5 w-5 text-amber-400 shrink-0" />
          )}
          <span className="text-sm sm:text-base font-extrabold text-white">
            {mapEngine === 'google' ? 'Google Maps 實景地圖' : '向量順路街區圖'}
          </span>
          {hasApiKey && (
            <span className="rounded-md bg-teal-900/60 border border-teal-500/40 px-2 py-0.5 text-xs font-bold text-teal-300">
              API 已啟用
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Engine Toggle Buttons */}
          <div className="inline-flex rounded-xl bg-stone-800 p-1 border border-stone-700">
            <button
              type="button"
              disabled={!hasApiKey}
              onClick={() => setMapEngine('google')}
              className={`rounded-lg px-2.5 py-1 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                mapEngine === 'google'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-stone-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed'
              }`}
              title={hasApiKey ? '切換為真實 Google Maps 實景' : '請先在「分類設定」填入 Google Maps API Key'}
            >
              🗺️ Google Maps
            </button>
            <button
              type="button"
              onClick={() => setMapEngine('vector')}
              className={`rounded-lg px-2.5 py-1 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                mapEngine === 'vector'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-300 hover:text-white'
              }`}
            >
              🎨 向量圖
            </button>
          </div>

          {activePlan && (
            <a
              href={activePlan.google_maps_nav_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3 py-1.5 text-xs sm:text-sm font-extrabold text-white hover:bg-teal-800 transition-colors"
            >
              導航
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {googleLoadError && mapEngine === 'vector' && (
        <div className="bg-amber-950/40 border-b border-amber-800/40 px-4 py-2 text-xs text-amber-300 font-medium">
          ⚠️ {googleLoadError}
        </div>
      )}

      {/* Main Map Canvas Area */}
      <div className="relative w-full bg-[#0d1620]">
        {/* Real Google Maps Container */}
        <div
          ref={googleMapRef}
          style={{ display: mapEngine === 'google' ? 'block' : 'none' }}
          className="w-full h-[380px] sm:h-[440px]"
        />

        {/* Vector SVG Fallback Map */}
        {mapEngine === 'vector' && (
          <div className="relative w-full overflow-hidden">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-[360px] sm:h-[420px] block"
            >
              {/* Rings */}
              {[75, 145, 210].map((r) => (
                <circle
                  key={r}
                  cx={originPt.x}
                  cy={originPt.y}
                  r={r}
                  fill="none"
                  stroke="rgba(245, 158, 11, 0.08)"
                  strokeWidth="1.2"
                />
              ))}

              {/* Grid Lines */}
              {Array.from({ length: 9 }).map((_, i) => (
                <line
                  key={`gx-${i}`}
                  x1={i * 75}
                  y1={0}
                  x2={i * 75}
                  y2={height}
                  stroke="rgba(148, 163, 184, 0.08)"
                  strokeWidth="1"
                />
              ))}
              {Array.from({ length: 6 }).map((_, i) => (
                <line
                  key={`gy-${i}`}
                  x1={0}
                  y1={i * 70}
                  x2={width}
                  y2={i * 70}
                  stroke="rgba(148, 163, 184, 0.08)"
                  strokeWidth="1"
                />
              ))}

              {/* Route Polyline */}
              {stopPoints.length > 0 && (
                <>
                  <polyline
                    points={polylinePoints}
                    fill="none"
                    stroke="rgba(245, 158, 11, 0.3)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={polylinePoints}
                    fill="none"
                    stroke="#f59e0b"
                    strokeWidth="3.5"
                    strokeDasharray="6 4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </>
              )}

              {/* Origin Marker */}
              <g
                transform={`translate(${originPt.x}, ${originPt.y})`}
                className="cursor-pointer"
              >
                <circle
                  r="14"
                  fill="#10b981"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                />
                <text
                  textAnchor="middle"
                  dy="4"
                  fontSize="10"
                  fontWeight="bold"
                  fill="#ffffff"
                >
                  🚩
                </text>
                <rect
                  x="-45"
                  y="18"
                  width="90"
                  height="18"
                  rx="4"
                  fill="rgba(15, 23, 42, 0.85)"
                  stroke="#10b981"
                  strokeWidth="1"
                />
                <text
                  x="0"
                  y="30"
                  textAnchor="middle"
                  fontSize="9.5"
                  fontWeight="bold"
                  fill="#a7f3d0"
                >
                  {origin.name.slice(0, 6)}
                </text>
              </g>

              {/* Stop Markers */}
              {stopPoints.map((pt, idx) => {
                const isSelected = pt.stop.place.id === selectedPlaceId;
                return (
                  <g
                    key={pt.stop.place.id}
                    transform={`translate(${pt.x}, ${pt.y})`}
                    onClick={() => {
                      setSelectedPlaceId(pt.stop.place.id);
                      onSelectPlace?.(pt.stop.place);
                    }}
                    className="cursor-pointer"
                  >
                    <circle
                      r={isSelected ? '16' : '13'}
                      fill={isSelected ? '#e11d48' : '#d97706'}
                      stroke="#ffffff"
                      strokeWidth="2.5"
                    />
                    <text
                      textAnchor="middle"
                      dy="4"
                      fontSize="11"
                      fontWeight="bold"
                      fill="#ffffff"
                    >
                      {idx + 1}
                    </text>
                    <rect
                      x="-48"
                      y="18"
                      width="96"
                      height="18"
                      rx="4"
                      fill={isSelected ? '#be123c' : 'rgba(15, 23, 42, 0.85)'}
                      stroke={isSelected ? '#fda4af' : '#d97706'}
                      strokeWidth="1"
                    />
                    <text
                      x="0"
                      y="30"
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight="bold"
                      fill="#ffffff"
                    >
                      {pt.stop.place.name.slice(0, 6)}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Zoom Controls for Vector Map */}
            <div className="absolute top-3 right-3 flex flex-col gap-1.5 z-10">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.4, Number((z * 1.25).toFixed(2))))}
                className="h-8 w-8 rounded-lg bg-stone-900/90 text-white font-black text-sm border border-stone-700 shadow-xs flex items-center justify-center cursor-pointer"
                title="放大"
              >
                ＋
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.6, Number((z * 0.8).toFixed(2))))}
                className="h-8 w-8 rounded-lg bg-stone-900/90 text-white font-black text-sm border border-stone-700 shadow-xs flex items-center justify-center cursor-pointer"
                title="縮小"
              >
                －
              </button>
            </div>
          </div>
        )}

        {/* Selected Place Overlay Card (Clean, Large font, works on both Google and Vector map) */}
        {selectedPlace && (
          <div className="m-3 rounded-2xl border-2 border-amber-500/60 bg-stone-950/95 p-4 text-stone-100 shadow-xl space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs sm:text-sm text-amber-400 font-extrabold">
                  📍 {selectedPlace.city}・{selectedPlace.district} ｜ ★ {selectedPlace.rating || 4.5}
                </span>
                <h4 className="text-base sm:text-lg font-black text-white">
                  {selectedPlace.name}
                </h4>
                <p className="text-stone-300 text-xs sm:text-sm">
                  📝 {selectedPlace.user_notes || '無備註'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlaceId(null)}
                className="text-stone-400 hover:text-white p-1 text-base cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1 border-t border-stone-800">
              <select
                value={selectedPlace.sub_category}
                onChange={(e) => {
                  const cfg = categoryConfigs.find(
                    (c) => c.sub_category === e.target.value
                  );
                  if (cfg) {
                    updatePlaceInline(selectedPlace.id, {
                      primary_category: cfg.primary_category,
                      sub_category: cfg.sub_category,
                      estimated_stay_mins: cfg.default_stay_mins,
                    });
                  }
                }}
                className="rounded-xl bg-stone-800 border border-stone-700 px-3 py-1.5 text-xs sm:text-sm font-bold text-white focus:outline-none"
              >
                {categoryConfigs.map((cfg) => (
                  <option key={cfg.id} value={cfg.sub_category}>
                    {cfg.sub_label}
                  </option>
                ))}
              </select>

              <div className="flex gap-1.5">
                {(
                  [
                    { key: 'unvisited', label: '🌟 想去' },
                    { key: 'visited_revisit', label: '❤️ 想再去' },
                    { key: 'visited_skip', label: '🚫 不推' },
                  ] as Array<{ key: VisitStatus; label: string }>
                ).map((st) => (
                  <button
                    key={st.key}
                    type="button"
                    onClick={() =>
                      updatePlaceInline(selectedPlace.id, {
                        visit_status: st.key,
                      })
                    }
                    className={`rounded-xl px-2.5 py-1.5 text-xs sm:text-sm font-extrabold cursor-pointer transition-colors ${
                      selectedPlace.visit_status === st.key
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-stone-800 text-stone-300 hover:text-white'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
