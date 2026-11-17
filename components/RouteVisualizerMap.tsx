'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  ExternalLink,
  KeyRound,
  Map as MapIcon,
  Navigation,
  Check,
  X,
  Compass,
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
  const { categoryConfigs, updatePlaceInline, settings, updateSettings } =
    usePlaces();
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(
    activePlan?.stops?.[0]?.place.id || null
  );

  const effectiveApiKey =
    settings.googleMapsApiKey?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    '';
  const hasApiKey = Boolean(effectiveApiKey);

  // Map engine: 'google' (Google Maps JS) or 'street' (Real Street Map via Leaflet/CartoDB)
  const [mapEngine, setMapEngine] = useState<'google' | 'street'>(
    hasApiKey ? 'google' : 'street'
  );
  const [isGoogleLoaded, setIsGoogleLoaded] = useState(false);
  const [googleLoadError, setGoogleLoadError] = useState<string | null>(null);

  // Quick API Key Modal / Dialog
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyInput, setKeyInput] = useState('');

  // Refs for Google Maps
  const googleMapRef = useRef<HTMLDivElement | null>(null);
  const googleMapInstanceRef = useRef<google.maps.Map | null>(null);
  const googleMarkersRef = useRef<google.maps.Marker[]>([]);
  const googlePolylineRef = useRef<google.maps.Polyline | null>(null);
  const googleInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  // Refs for Leaflet Street Map
  const leafletContainerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletMapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leafletLayersRef = useRef<any[]>([]);

  const stops = activePlan?.stops || [];
  const selectedPlace =
    candidates.find((c) => c.id === selectedPlaceId) ||
    stops.find((s) => s.place.id === selectedPlaceId)?.place ||
    null;

  // Auto-sync effectiveApiKey into settings if missing in localStorage
  useEffect(() => {
    if (!settings.googleMapsApiKey?.trim() && effectiveApiKey) {
      updateSettings({ googleMapsApiKey: effectiveApiKey });
    }
  }, [settings.googleMapsApiKey, effectiveApiKey, updateSettings]);

  // Sync selectedPlaceId if plan changes
  useEffect(() => {
    if (stops.length > 0 && !selectedPlaceId) {
      setSelectedPlaceId(stops[0].place.id);
    }
  }, [stops, selectedPlaceId]);

  // Handle Google Maps auth failure gracefully
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).gm_authFailure = () => {
        setGoogleLoadError(
          'Google Maps API 驗證失敗（可能未開通 Billing、缺少 Maps JavaScript API 權限或金鑰錯誤），已自動切換為街道實景地圖。'
        );
        setMapEngine('street');
      };
    }
  }, []);

  // -------------------------------------------------------------
  // 1. Google Maps SDK Loader
  // -------------------------------------------------------------
  useEffect(() => {
    if (!effectiveApiKey) {
      setIsGoogleLoaded(false);
      setMapEngine('street');
      return;
    }

    // Check if already in window
    if (
      typeof window !== 'undefined' &&
      (window as unknown as { google?: { maps?: unknown } }).google?.maps
    ) {
      setIsGoogleLoaded(true);
      setMapEngine('google');
      return;
    }

    const scriptId = 'google-maps-js-sdk';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
        effectiveApiKey
      )}&libraries=places,geometry`;
      script.async = true;
      script.defer = true;
      script.onload = () => {
        setIsGoogleLoaded(true);
        setGoogleLoadError(null);
        setMapEngine('google');
      };
      script.onerror = () => {
        setGoogleLoadError(
          'Google Maps 載入失敗，已自動切換為開放街道實景圖。'
        );
        setMapEngine('street');
      };
      document.head.appendChild(script);
    } else {
      setIsGoogleLoaded(true);
      setMapEngine('google');
    }
  }, [effectiveApiKey]);

  // -------------------------------------------------------------
  // 2. Render Google Maps
  // -------------------------------------------------------------
  useEffect(() => {
    if (mapEngine !== 'google' || !isGoogleLoaded || !googleMapRef.current)
      return;
    if (
      typeof window === 'undefined' ||
      !(
        window as unknown as {
          google?: { maps?: typeof google.maps };
        }
      ).google?.maps
    )
      return;

    const gmaps = google.maps;

    if (!googleMapInstanceRef.current) {
      googleMapInstanceRef.current = new gmaps.Map(googleMapRef.current, {
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
      googleInfoWindowRef.current = new gmaps.InfoWindow();
    }

    const map = googleMapInstanceRef.current;
    const infoWindow = googleInfoWindowRef.current;

    // Clear old markers & polyline
    googleMarkersRef.current.forEach((m) => m.setMap(null));
    googleMarkersRef.current = [];
    if (googlePolylineRef.current) {
      googlePolylineRef.current.setMap(null);
      googlePolylineRef.current = null;
    }

    const bounds = new gmaps.LatLngBounds();

    // Origin Marker
    const originPos = { lat: origin.latitude, lng: origin.longitude };
    bounds.extend(originPos);
    const originMarker = new gmaps.Marker({
      position: originPos,
      map,
      title: `🚩 起點：${origin.name}`,
      icon: {
        path: gmaps.SymbolPath.CIRCLE,
        scale: 13,
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
    googleMarkersRef.current.push(originMarker);

    // Stops
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

      googleMarkersRef.current.push(marker);
    });

    // End Anchor
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
      googleMarkersRef.current.push(endMarker);
    }

    // Polyline
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

    googlePolylineRef.current = new gmaps.Polyline({
      path: routeCoordinates,
      geodesic: true,
      strokeColor: '#d97706',
      strokeOpacity: 0.9,
      strokeWeight: 5,
      map,
    });

    if (stops.length > 0) {
      map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
    }
  }, [
    mapEngine,
    isGoogleLoaded,
    origin,
    stops,
    activePlan?.end_anchor,
    selectedPlaceId,
    onSelectPlace,
  ]);

  // -------------------------------------------------------------
  // 3. Render Leaflet Street Map (Real CartoDB / OSM tiles)
  // -------------------------------------------------------------
  useEffect(() => {
    let isCancelled = false;

    async function initOrUpdateLeaflet() {
      if (typeof window === 'undefined' || !leafletContainerRef.current) return;

      const L = (await import('leaflet')).default;
      if (isCancelled || !leafletContainerRef.current) return;

      // Initialize map instance if not exists
      if (!leafletMapInstanceRef.current) {
        const lMap = L.map(leafletContainerRef.current, {
          center: [origin.latitude, origin.longitude],
          zoom: 14,
          zoomControl: true,
        });

        // CartoDB Voyager tiles: Crisp, modern street map with clear Traditional Chinese & multilingual labels
        L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
            subdomains: 'abcd',
            maxZoom: 20,
          }
        ).addTo(lMap);

        leafletMapInstanceRef.current = lMap;
      }

      const lMap = leafletMapInstanceRef.current;
      lMap.invalidateSize();

      // Clear existing layers (markers & lines)
      leafletLayersRef.current.forEach((layer) => {
        lMap.removeLayer(layer);
      });
      leafletLayersRef.current = [];

      const latLngs: [number, number][] = [];

      // Origin Marker
      const originIcon = L.divIcon({
        className: 'origin-marker-pin',
        html: `
          <div style="display:flex; flex-direction:column; align-items:center; transform:translate(-50%, -100%);">
            <div style="background:#10b981; color:white; width:32px; height:32px; border-radius:50%; border:2.5px solid white; display:flex; align-items:center; justify-content:center; font-size:16px; box-shadow:0 3px 8px rgba(0,0,0,0.35);">
              🚩
            </div>
            <div style="background:rgba(15,23,42,0.92); color:#a7f3d0; font-size:11px; font-weight:800; padding:2px 7px; border-radius:6px; margin-top:2px; white-space:nowrap; border:1px solid #10b981; box-shadow:0 2px 5px rgba(0,0,0,0.25);">
              起點：${origin.name.slice(0, 7)}
            </div>
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });

      const oMarker = L.marker([origin.latitude, origin.longitude], {
        icon: originIcon,
      }).addTo(lMap);
      oMarker.bindPopup(`
        <div style="font-family:sans-serif; padding:4px;">
          <span style="font-size:11px; font-weight:bold; color:#10b981;">行程起點</span>
          <h4 style="font-size:15px; font-weight:900; margin:2px 0;">${origin.name}</h4>
        </div>
      `);
      leafletLayersRef.current.push(oMarker);
      latLngs.push([origin.latitude, origin.longitude]);

      // Stop Markers (1, 2, 3...)
      stops.forEach((stop, idx) => {
        const isSelected = stop.place.id === selectedPlaceId;
        const stopIcon = L.divIcon({
          className: 'stop-marker-pin',
          html: `
            <div style="display:flex; flex-direction:column; align-items:center; transform:translate(-50%, -100%);">
              <div style="background:${isSelected ? '#e11d48' : '#d97706'}; color:white; width:${isSelected ? '32px' : '28px'}; height:${isSelected ? '32px' : '28px'}; border-radius:50%; border:2.5px solid white; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:${isSelected ? '14px' : '12px'}; box-shadow:0 3px 8px rgba(0,0,0,0.35);">
                ${idx + 1}
              </div>
              <div style="background:${isSelected ? '#be123c' : 'rgba(15,23,42,0.92)'}; color:white; font-size:11px; font-weight:800; padding:2px 6px; border-radius:6px; margin-top:2px; white-space:nowrap; border:1px solid ${isSelected ? '#fda4af' : '#f59e0b'}; box-shadow:0 2px 5px rgba(0,0,0,0.25);">
                ${stop.place.name.slice(0, 7)}
              </div>
            </div>
          `,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });

        const sMarker = L.marker([stop.place.latitude, stop.place.longitude], {
          icon: stopIcon,
          zIndexOffset: isSelected ? 1000 : 100 + idx,
        }).addTo(lMap);

        sMarker.on('click', () => {
          setSelectedPlaceId(stop.place.id);
          onSelectPlace?.(stop.place);
        });

        sMarker.bindPopup(`
          <div style="font-family:sans-serif; padding:4px; min-width:180px;">
            <div style="font-size:11px; font-weight:bold; color:#d97706;">第 ${idx + 1} 站 ｜ 停留 ${stop.stay_mins} 分</div>
            <h4 style="font-size:15px; font-weight:900; margin:2px 0; color:#0f172a;">${stop.place.name}</h4>
            <div style="font-size:12px; color:#64748b; margin-bottom:4px;">
              ${stop.arrival_time}–${stop.departure_time} ｜ ★ ${stop.place.rating || 4.5}
            </div>
            <div style="font-size:11px; color:#334155; line-height:1.4;">${stop.ai_reason}</div>
          </div>
        `);

        leafletLayersRef.current.push(sMarker);
        latLngs.push([stop.place.latitude, stop.place.longitude]);
      });

      // End Anchor Marker
      if (activePlan?.end_anchor) {
        const isHsr = activePlan.end_anchor.anchor_type === 'hsr';
        const isTrain = activePlan.end_anchor.anchor_type === 'train';
        const endIconEmoji = isHsr ? '🚄' : isTrain ? '🚆' : '🏨';

        const endIcon = L.divIcon({
          className: 'end-marker-pin',
          html: `
            <div style="display:flex; flex-direction:column; align-items:center; transform:translate(-50%, -100%);">
              <div style="background:#e11d48; color:white; width:30px; height:30px; border-radius:50%; border:2.5px solid white; display:flex; align-items:center; justify-content:center; font-size:15px; box-shadow:0 3px 8px rgba(0,0,0,0.35);">
                ${endIconEmoji}
              </div>
              <div style="background:rgba(15,23,42,0.92); color:#fecdd3; font-size:11px; font-weight:800; padding:2px 6px; border-radius:6px; margin-top:2px; white-space:nowrap; border:1px solid #e11d48; box-shadow:0 2px 5px rgba(0,0,0,0.25);">
                終點：${activePlan.end_anchor.name.slice(0, 7)}
              </div>
            </div>
          `,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        });

        const eMarker = L.marker(
          [activePlan.end_anchor.latitude, activePlan.end_anchor.longitude],
          { icon: endIcon, zIndexOffset: 500 }
        ).addTo(lMap);

        eMarker.bindPopup(`
          <div style="font-family:sans-serif; padding:4px;">
            <div style="font-size:11px; font-weight:bold; color:#e11d48;">行程終點站</div>
            <h4 style="font-size:15px; font-weight:900; margin:2px 0;">${activePlan.end_anchor?.name}</h4>
            <div style="font-size:12px; color:#64748b;">${activePlan.end_anchor?.arrival_time} 抵達</div>
          </div>
        `);

        leafletLayersRef.current.push(eMarker);
        latLngs.push([
          activePlan.end_anchor.latitude,
          activePlan.end_anchor.longitude,
        ]);
      }

      // Route Polyline
      if (latLngs.length > 1) {
        const polyline = L.polyline(latLngs, {
          color: '#d97706',
          weight: 5,
          opacity: 0.85,
          lineJoin: 'round',
        }).addTo(lMap);
        leafletLayersRef.current.push(polyline);

        lMap.fitBounds(polyline.getBounds(), {
          padding: [45, 45],
          maxZoom: 16,
        });
      } else {
        lMap.setView([origin.latitude, origin.longitude], 14);
      }
    }

    initOrUpdateLeaflet();

    return () => {
      isCancelled = true;
    };
  }, [
    mapEngine,
    origin,
    stops,
    activePlan?.end_anchor,
    selectedPlaceId,
    onSelectPlace,
  ]);

  // When switching engine, invalidate Leaflet size
  useEffect(() => {
    if (mapEngine === 'street' && leafletMapInstanceRef.current) {
      setTimeout(() => {
        leafletMapInstanceRef.current?.invalidateSize();
      }, 100);
    }
  }, [mapEngine]);

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    updateSettings({ googleMapsApiKey: trimmed });
    setShowKeyModal(false);
    setGoogleLoadError(null);
    setMapEngine('google');
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-900 text-stone-100 overflow-hidden shadow-xs space-y-0">
      {/* Map Header with Engine Switcher (Google Maps vs Real Street Map) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-stone-800 bg-stone-950/90">
        <div className="flex items-center gap-2">
          {mapEngine === 'google' ? (
            <MapIcon className="h-5 w-5 text-teal-400 shrink-0" />
          ) : (
            <Compass className="h-5 w-5 text-amber-400 shrink-0" />
          )}
          <span className="text-sm sm:text-base font-extrabold text-white">
            {mapEngine === 'google' ? 'Google Maps 實景地圖' : '開放街道實景圖'}
          </span>
          {hasApiKey ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-teal-900/60 border border-teal-500/40 px-2 py-0.5 text-xs font-bold text-teal-300">
              <Check className="h-3 w-3" />
              API 已啟用
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setShowKeyModal(true)}
              className="inline-flex items-center gap-1 rounded-md bg-amber-500/20 border border-amber-400/40 px-2 py-0.5 text-xs font-bold text-amber-300 hover:bg-amber-500/30 cursor-pointer transition-colors"
            >
              <KeyRound className="h-3 w-3" />
              貼上 Key 啟用 Google
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Engine Toggle Buttons */}
          <div className="inline-flex rounded-xl bg-stone-800 p-1 border border-stone-700">
            <button
              type="button"
              onClick={() => {
                if (!hasApiKey) {
                  setShowKeyModal(true);
                } else {
                  setMapEngine('google');
                }
              }}
              className={`rounded-lg px-2.5 py-1 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                mapEngine === 'google'
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'text-stone-300 hover:text-white'
              }`}
              title={
                hasApiKey
                  ? '切換為真實 Google Maps 實景'
                  : '點擊輸入 Google Maps API Key 即可開啟'
              }
            >
              🗺️ Google Maps
            </button>
            <button
              type="button"
              onClick={() => setMapEngine('street')}
              className={`rounded-lg px-2.5 py-1 text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                mapEngine === 'street'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-stone-300 hover:text-white'
              }`}
              title="切換為開放街道實景圖（免 API Key 即享完整街區、站名與路網）"
            >
              🌍 街道實景圖
            </button>
          </div>

          {activePlan && (
            <a
              href={activePlan.google_maps_nav_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl bg-teal-700 px-3 py-1.5 text-xs sm:text-sm font-extrabold text-white hover:bg-teal-800 transition-colors shadow-xs"
            >
              <Navigation className="h-3.5 w-3.5" />
              導航
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      {/* Quick API Key Prompt Banner (shown if no key is set) */}
      {!hasApiKey && (
        <div className="bg-amber-950/60 border-b border-amber-800/50 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200">
          <div className="flex items-center gap-1.5 font-medium">
            <span>💡 目前以「開放街道實景圖」清晰顯示路網與站牌。</span>
            <span className="hidden sm:inline">已有 Google Maps API Key？</span>
          </div>
          <button
            type="button"
            onClick={() => setShowKeyModal(true)}
            className="rounded-lg bg-amber-500 hover:bg-amber-400 text-stone-950 px-2.5 py-1 font-black text-xs cursor-pointer transition-colors shadow-xs"
          >
            🔑 點此貼上 Key 開啟 Google Maps
          </button>
        </div>
      )}

      {/* Google Maps Load Error Notice */}
      {googleLoadError && mapEngine === 'street' && (
        <div className="bg-amber-950/50 border-b border-amber-800/40 px-4 py-2 text-xs text-amber-300 font-medium flex items-center justify-between">
          <span>⚠️ {googleLoadError}</span>
          <button
            type="button"
            onClick={() => setShowKeyModal(true)}
            className="underline font-bold hover:text-white cursor-pointer ml-2"
          >
            更換 Key
          </button>
        </div>
      )}

      {/* Main Map Canvas Area */}
      <div className="relative w-full h-[380px] sm:h-[450px] bg-stone-100 overflow-hidden">
        {/* Real Google Maps Container */}
        <div
          ref={googleMapRef}
          style={{ display: mapEngine === 'google' ? 'block' : 'none' }}
          className="w-full h-full"
        />

        {/* Real Street Map (Leaflet) Container */}
        <div
          ref={leafletContainerRef}
          style={{ display: mapEngine === 'street' ? 'block' : 'none' }}
          className="w-full h-full z-0"
        />

        {/* Selected Place Overlay Card */}
        {selectedPlace && (
          <div className="absolute bottom-3 left-3 right-3 z-[1000] rounded-2xl border-2 border-amber-500/70 bg-stone-950/95 p-4 text-stone-100 shadow-2xl space-y-3 backdrop-blur-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs sm:text-sm text-amber-400 font-extrabold">
                  📍 {selectedPlace.city}・{selectedPlace.district} ｜ ★{' '}
                  {selectedPlace.rating || 4.5}
                </span>
                <h4 className="text-base sm:text-lg font-black text-white">
                  {selectedPlace.name}
                </h4>
                <p className="text-stone-300 text-xs sm:text-sm line-clamp-1">
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

      {/* Quick API Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-stone-700 bg-stone-900 p-6 text-stone-100 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MapIcon className="h-6 w-6 text-teal-400" />
                <h3 className="text-lg font-black text-white">
                  設定 Google Maps API Key
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowKeyModal(false)}
                className="text-stone-400 hover:text-white cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs sm:text-sm text-stone-300 leading-relaxed">
              貼上您的 Google Maps JavaScript API 金鑰，即可在網頁直接使用官方
              Google Maps 實景地圖（包含衛星圖、街景服務等）。
            </p>

            <form onSubmit={handleSaveApiKey} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-300 mb-1.5">
                  API 金鑰（以 AIzaSy... 開頭）
                </label>
                <input
                  type="text"
                  placeholder="AIzaSy..."
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="w-full rounded-xl bg-stone-950 border border-stone-700 px-3.5 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-teal-500"
                  autoFocus
                />
              </div>

              <div className="rounded-xl bg-stone-800/70 p-3 text-xs text-stone-300 space-y-1">
                <p className="font-bold text-amber-300">💡 提示：</p>
                <p>• 若未輸入金鑰，仍可使用高解析度「開放街道實景圖」。</p>
                <p>• 也可隨時點右上角「導航」直接在 Google Maps App 開啟。</p>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="rounded-xl bg-stone-800 px-4 py-2 text-xs sm:text-sm font-bold text-stone-300 hover:text-white cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={!keyInput.trim()}
                  className="rounded-xl bg-teal-600 px-5 py-2 text-xs sm:text-sm font-black text-white hover:bg-teal-500 disabled:opacity-40 cursor-pointer shadow-xs transition-colors"
                >
                  儲存並立即啟用
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
