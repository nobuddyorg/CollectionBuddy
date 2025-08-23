'use client';
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

type Leaflet = typeof import('leaflet');

type IconDefaultPrivate = import('leaflet').Icon.Default & {
  _getIconUrl?: () => string;
};

interface MarkerInput {
  lat: number;
  lng: number;
  popupText: string;
}

interface MapProps {
  markers: MarkerInput[];
  currentLocation?: { lat: number; lng: number; popupText?: string };
  command?: 'fitAll' | 'fitCurrent' | null;
}

const toUrl = (mod: unknown): string => {
  if (typeof mod === 'string') return mod;
  const withSrc = mod as { src?: string };
  if (withSrc && typeof withSrc.src === 'string') return withSrc.src;
  throw new Error('Unsupported image import format');
};

const Map: React.FC<MapProps> = ({ markers, currentLocation, command }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const LRef = useRef<Leaflet | null>(null);
  const mapInstance = useRef<import('leaflet').Map | null>(null);
  const layersRef = useRef<import('leaflet').LayerGroup | null>(null);

  const latestCommandRef = useRef<MapProps['command']>(null);
  const [ready, setReady] = useState(false);
  const hasInitialFit = useRef(false);

  useEffect(() => {
    latestCommandRef.current = command ?? null;
  }, [command]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!mapRef.current || mapInstance.current) return;
      if (typeof window === 'undefined') return;

      const L = (await import('leaflet')).default as Leaflet;
      if (cancelled) return;
      LRef.current = L;

      delete (L.Icon.Default.prototype as IconDefaultPrivate)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: toUrl(iconRetinaUrl),
        iconUrl: toUrl(iconUrl),
        shadowUrl: toUrl(shadowUrl),
      });

      const map = L.map(mapRef.current).setView([51.505, -0.09], 13);
      mapInstance.current = map;

      map.createPane('currentLocation');
      const currentLocationPane = map.getPane('currentLocation');
      if (currentLocationPane) currentLocationPane.style.zIndex = '650';

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      layersRef.current = L.layerGroup().addTo(map);

      setReady(true);
      requestAnimationFrame(() => map.invalidateSize());

      const cmd = latestCommandRef.current;
      if (!cmd) return;
      requestAnimationFrame(() => {
        if (cmd === 'fitAll') {
          const pts: Array<import('leaflet').LatLngExpression> = [];
          markers.forEach((m) => pts.push([m.lat, m.lng]));
          if (currentLocation) pts.push([currentLocation.lat, currentLocation.lng]);
          if (pts.length > 0) {
            const bounds = L.latLngBounds(pts);
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [8, 8] });
          }
        } else if (cmd === 'fitCurrent' && currentLocation) {
          const bounds = L.latLng(currentLocation.lat, currentLocation.lng).toBounds(100000);
          map.fitBounds(bounds, { padding: [8, 8] });
        }
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [markers, currentLocation]);

  useEffect(() => {
    const L = LRef.current;
    if (!ready || !L || !mapInstance.current || !layersRef.current) return;

    layersRef.current.clearLayers();

    const points: Array<import('leaflet').LatLngExpression> = [];

    markers.forEach((m) => {
      L.marker([m.lat, m.lng]).addTo(layersRef.current!).bindPopup(m.popupText);
      points.push([m.lat, m.lng]);
    });

    if (currentLocation) {
      const { lat, lng } = currentLocation;
      const here = L.circleMarker([lat, lng], {
        radius: 8,
        weight: 2,
        color: '#b91c1c',
        fillColor: '#ef4444',
        fillOpacity: 1,
        pane: 'currentLocation',
      }).addTo(layersRef.current!);
      if (currentLocation.popupText) here.bindPopup(currentLocation.popupText);
      points.push([lat, lng]);
    }

    // Only auto-fit once on first render; afterwards use the buttons.
    if (!hasInitialFit.current && points.length > 0) {
      const bounds = L.latLngBounds(points);
      if (bounds.isValid()) mapInstance.current.fitBounds(bounds, { padding: [8, 8] });
      hasInitialFit.current = true;
    }
  }, [markers, currentLocation, ready]);

  useEffect(() => {
    const L = LRef.current;
    if (!ready || !L || !mapInstance.current) return;

    if (command === 'fitAll') {
      const pts: Array<import('leaflet').LatLngExpression> = [];
      markers.forEach((m) => pts.push([m.lat, m.lng]));
      if (currentLocation) pts.push([currentLocation.lat, currentLocation.lng]);
      if (pts.length > 0) {
        const bounds = L.latLngBounds(pts);
        if (bounds.isValid()) mapInstance.current.fitBounds(bounds, { padding: [8, 8] });
      }
    } else if (command === 'fitCurrent' && currentLocation) {
      const bounds = L.latLng(currentLocation.lat, currentLocation.lng).toBounds(100000);
      mapInstance.current.fitBounds(bounds, { padding: [8, 8] });
    }
  }, [command, markers, currentLocation, ready]);

  return <div ref={mapRef} style={{ height: '400px', width: '100%' }} />;
};

export default Map;
