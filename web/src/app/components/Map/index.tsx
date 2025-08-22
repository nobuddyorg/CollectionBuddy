'use client';
import { useEffect, useRef } from 'react';
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
}

const toUrl = (mod: unknown): string => {
  if (typeof mod === 'string') return mod;
  const withSrc = mod as { src?: string };
  if (withSrc && typeof withSrc.src === 'string') return withSrc.src;
  throw new Error('Unsupported image import format');
};

const Map: React.FC<MapProps> = ({ markers, currentLocation }) => {
  const mapRef = useRef<HTMLDivElement>(null);

  const LRef = useRef<Leaflet | null>(null);
  const mapInstance = useRef<import('leaflet').Map | null>(null);
  const layersRef = useRef<import('leaflet').LayerGroup | null>(null);

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

      mapInstance.current = L.map(mapRef.current).setView([51.505, -0.09], 13);

      mapInstance.current.createPane('currentLocation');
      const currentLocationPane =
        mapInstance.current.getPane('currentLocation');
      if (currentLocationPane) {
        currentLocationPane.style.zIndex = '650';
      }

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(mapInstance.current);

      layersRef.current = L.layerGroup().addTo(mapInstance.current);

      setTimeout(() => mapInstance.current?.invalidateSize(), 0);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const L = LRef.current;
    if (!L || !mapInstance.current || !layersRef.current) return;

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

      if (currentLocation.popupText) {
        here.bindPopup(currentLocation.popupText);
      }

      points.push([lat, lng]);
    }

    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      if (bounds.isValid()) {
        mapInstance.current.fitBounds(bounds, { padding: [24, 24] });
      }
    }
  }, [markers, currentLocation]);

  return <div ref={mapRef} style={{ height: '400px', width: '100%' }} />;
};

export default Map;
