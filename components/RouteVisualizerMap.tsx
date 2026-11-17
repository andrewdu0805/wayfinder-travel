'use client';

import React, { useState } from 'react';
import { ExternalLink, Navigation } from 'lucide-react';
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
  const { categoryConfigs, updatePlaceInline } = usePlaces();
  const [zoom, setZoom] = useState(1.0);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    activePlan?.stops?.[0]?.place.id || null
  );

  const stops = activePlan?.stops || [];
  const selectedPlace =
    candidates.find((c) => c.id === selectedPlaceId) ||
    stops.find((s) => s.place.id === selectedPlaceId)?.place ||
    null;

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
    <div className="rounded-2xl border border-stone-200 bg-stone-900 text-stone-100 overflow-hidden shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-stone-800 bg-stone-950/60">
        <div className="flex items-center gap-2">
          <Navigation className="h-4 w-4 text-amber-400" />
          <span className="text-xs sm:text-sm font-semibold">
            互動式街區地圖（點擊任一圖釘可 1 秒改狀態／分類）
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.4, Number((z * 1.25).toFixed(2))))}
            className="rounded-md bg-stone-800 px-2 py-1 text-xs font-bold hover:bg-stone-700 cursor-pointer"
          >
            ＋放大
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.6, Number((z * 0.8).toFixed(2))))}
            className="rounded-md bg-stone-800 px-2 py-1 text-xs font-bold hover:bg-stone-700 cursor-pointer"
          >
            －縮小
          </button>
          {activePlan && (
            <a
              href={activePlan.google_maps_nav_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-500 transition-colors"
            >
              導航
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </div>

      <div className="relative w-full overflow-hidden bg-[#0d1620]">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-[350px] sm:h-[400px] block"
        >
          {/* Topographic & Radius Rings */}
          {[75, 145, 210].map((r) => (
            <circle
              key={r}
              cx={originPt.x}
              cy={originPt.y}
              r={r}
              fill="none"
              stroke="rgba(20, 184, 166, 0.16)"
              strokeDasharray="5 4"
              strokeWidth="1"
            />
          ))}

          {/* Route Polyline */}
          {stopPoints.length > 0 && (
            <>
              <polyline
                fill="none"
                stroke="rgba(245, 158, 11, 0.25)"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={polylinePoints}
              />
              <polyline
                fill="none"
                stroke="#f59e0b"
                strokeWidth="3"
                strokeDasharray="7 4"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={polylinePoints}
              />
            </>
          )}

          {/* Non-selected candidate pins */}
          {candidates.map((cand) => {
            const isSelectedStop = stops.some((s) => s.place.id === cand.id);
            if (isSelectedStop) return null;
            const pt = project(cand.latitude, cand.longitude);
            const isFocused = selectedPlaceId === cand.id;
            return (
              <g
                key={cand.id}
                onClick={() => {
                  setSelectedPlaceId(cand.id);
                  onSelectPlace?.(cand);
                }}
                className="cursor-pointer"
              >
                {isFocused && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={16}
                    fill="none"
                    stroke="#facc15"
                    strokeWidth="2"
                  />
                )}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={8}
                  fill={
                    cand.visit_status === 'unvisited' ? '#10b981' : '#f59e0b'
                  }
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                <text
                  x={pt.x}
                  y={pt.y + 20}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill="#cbd5e1"
                >
                  {cand.name.slice(0, 7)}
                </text>
              </g>
            );
          })}

          {/* Origin Marker */}
          <g>
            <circle
              cx={originPt.x}
              cy={originPt.y}
              r={14}
              fill="rgba(20, 184, 166, 0.28)"
            />
            <circle
              cx={originPt.x}
              cy={originPt.y}
              r={7}
              fill="#14b8a6"
              stroke="#ffffff"
              strokeWidth="2"
            />
            <text
              x={originPt.x}
              y={originPt.y - 14}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill="#5eead4"
            >
              📍 出發點
            </text>
          </g>

          {/* Active Route Numbered Stop Markers */}
          {stopPoints.map(({ stop, x, y }) => {
            const isFocused = selectedPlaceId === stop.place.id;
            return (
              <g
                key={stop.place.id}
                onClick={() => {
                  setSelectedPlaceId(stop.place.id);
                  onSelectPlace?.(stop.place);
                }}
                className="cursor-pointer"
              >
                {isFocused && (
                  <circle
                    cx={x}
                    cy={y}
                    r={20}
                    fill="none"
                    stroke="#facc15"
                    strokeWidth="2.5"
                    strokeDasharray="4 3"
                  />
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={13}
                  fill="#d97706"
                  stroke="#ffffff"
                  strokeWidth="2"
                />
                <text
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="800"
                  fill="#ffffff"
                >
                  {stop.stop_order}
                </text>
                <rect
                  x={x - 58}
                  y={y + 16}
                  width={116}
                  height={20}
                  rx={5}
                  fill="rgba(15, 23, 42, 0.9)"
                  stroke="rgba(245, 158, 11, 0.45)"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={y + 29}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill="#f8fafc"
                >
                  {stop.arrival_time} {stop.place.name.slice(0, 7)}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Floating Map Popover Card for Instant 1-Tap Editing */}
        {selectedPlace && (
          <div className="m-3 rounded-xl border border-amber-500/40 bg-stone-950/95 p-3 text-xs space-y-2 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <div>
                <span className="text-[11px] text-amber-400 font-semibold">
                  📍 {selectedPlace.city}・{selectedPlace.district}
                </span>
                <h4 className="text-sm font-bold text-white">
                  {selectedPlace.name}
                </h4>
                <p className="text-stone-400 text-[11px]">
                  📝 {selectedPlace.user_notes || '無備註'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPlaceId(null)}
                className="text-stone-400 hover:text-white px-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
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
                className="rounded bg-stone-800 border border-stone-700 px-2 py-1 text-xs text-white"
              >
                {categoryConfigs.map((cfg) => (
                  <option key={cfg.id} value={cfg.sub_category}>
                    {cfg.sub_label}
                  </option>
                ))}
              </select>

              <div className="flex gap-1">
                {(
                  [
                    { key: 'unvisited', label: '🌟 沒去過' },
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
                    className={`rounded px-2 py-1 text-[11px] font-semibold cursor-pointer ${
                      selectedPlace.visit_status === st.key
                        ? 'bg-amber-600 text-white'
                        : 'bg-stone-800 text-stone-300'
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
