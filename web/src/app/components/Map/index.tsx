'use client';
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { IconDefaultPrivate, Leaflet, MapProps, MarkerInput } from './types';

const toUrl = (mod: unknown): string => {
  if (typeof mod === 'string') return mod;
  const withSrc = mod as { src?: string };
  if (withSrc && typeof withSrc.src === 'string') return withSrc.src;
  throw new Error('Unsupported image import format');
};

const BOUNDS_PAD_RATIO = 0.015;

// A ceiling for every automatic fit. Pins are geocoded from a place *name*
// ("Cologne"), so they are only ever city-accurate -- and fitBounds, left
// alone, frames a single pin or a tight cluster at the tile layer's maximum
// zoom, dropping the viewer onto a rooftop that the underlying data never
// claimed. Zoom 12 shows the city the pin actually means.
const FIT_MAX_ZOOM = 12;

// Width of the box "zoom to me" frames around the current position: a
// regional view, so the surrounding pins stay in the picture.
const CURRENT_LOCATION_SPAN_M = 100000;

// Every automatic fit frames the pins' *coordinates*, but a marker is a
// 25x41 icon hanging above the point it marks, so a pin on the edge of the
// bounds had its head cut off by the viewport -- 8px of padding could not
// hold a 41px icon. The asymmetry is the icon's: it rises from its anchor,
// and nothing hangs below it.
//
// The top allowance also clears the map's own furniture -- the geocoding
// chip on the left and the zoom/locate cluster on the right, both `top-2`
// and 36px tall -- so the outermost pin isn't framed underneath a button.
const MARKER_ICON_HEIGHT = 41;
const MARKER_ICON_HALF_WIDTH = 13;
const CONTROLS_BOTTOM_EDGE = 44;

const FIT_OPTIONS: import('leaflet').FitBoundsOptions = {
  paddingTopLeft: [
    MARKER_ICON_HALF_WIDTH,
    Math.max(MARKER_ICON_HEIGHT, CONTROLS_BOTTOM_EDGE),
  ],
  paddingBottomRight: [MARKER_ICON_HALF_WIDTH, 8],
  maxZoom: FIT_MAX_ZOOM,
};

const popupContent = (text: string): HTMLDivElement => {
  const el = document.createElement('div');
  el.textContent = text;
  return el;
};

const fitToPoints = (
  map: import('leaflet').Map,
  L: Leaflet,
  points: Array<import('leaflet').LatLngExpression>,
): void => {
  if (points.length === 0) return;
  const bounds = L.latLngBounds(points).pad(BOUNDS_PAD_RATIO);
  if (bounds.isValid()) map.fitBounds(bounds, FIT_OPTIONS);
};

// Shared by the two places a command can arrive: one already queued when the
// map finishes initialising, and every later one. Both used to frame the view
// with their own copy of this, which is two ways for the zoom to drift apart.
const runCommand = (
  map: import('leaflet').Map,
  L: Leaflet,
  command: MapProps['command'],
  markers: MarkerInput[],
  currentLocation: MapProps['currentLocation'],
): void => {
  if (command === 'fitAll') {
    const points: Array<import('leaflet').LatLngExpression> = markers.map(
      (m) => [m.lat, m.lng],
    );
    if (currentLocation)
      points.push([currentLocation.lat, currentLocation.lng]);
    fitToPoints(map, L, points);
  } else if (command === 'fitCurrent') {
    if (!currentLocation) return;
    const { lat, lng } = currentLocation;
    map.fitBounds(
      L.latLng(lat, lng).toBounds(CURRENT_LOCATION_SPAN_M),
      FIT_OPTIONS,
    );
  }
};

const Map: React.FC<MapProps> = ({ markers, currentLocation, command }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const LRef = useRef<Leaflet | null>(null);
  const mapInstance = useRef<import('leaflet').Map | null>(null);
  const layersRef = useRef<import('leaflet').LayerGroup | null>(null);
  const currentLocationLayerRef = useRef<import('leaflet').LayerGroup | null>(
    null,
  );

  const latestCommandRef = useRef<MapProps['command']>(null);
  const markersRef = useRef(markers);
  const currentLocRef = useRef(currentLocation);

  const [ready, setReady] = useState(false);
  const hasInitialFit = useRef(false);

  useEffect(() => {
    latestCommandRef.current = command ?? null;
  }, [command]);

  useEffect(() => {
    markersRef.current = markers;
  }, [markers]);

  useEffect(() => {
    currentLocRef.current = currentLocation;
  }, [currentLocation]);

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

      // The map is mounted before its pins are geocoded, so it opens on a
      // world view: a zoomed-in default would fetch a screenful of tiles
      // for a place nobody asked about, then throw them away on the fit.
      const map = L.map(mapRef.current).setView([20, 0], 2);
      mapInstance.current = map;

      map.createPane('currentLocation');
      const currentLocationPane = map.getPane('currentLocation');
      if (currentLocationPane) currentLocationPane.style.zIndex = '650';

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map);

      layersRef.current = L.layerGroup().addTo(map);
      currentLocationLayerRef.current = L.layerGroup().addTo(map);

      setReady(true);
      requestAnimationFrame(() => map.invalidateSize());

      const L2 = LRef.current;
      const cmd = latestCommandRef.current;
      if (!L2 || !cmd) return;

      requestAnimationFrame(() => {
        runCommand(map, L2, cmd, markersRef.current, currentLocRef.current);
      });
    })();
    return () => {
      cancelled = true;
      mapInstance.current?.remove();
      mapInstance.current = null;
      layersRef.current = null;
      currentLocationLayerRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const L = LRef.current;
    if (!ready || !L || !mapInstance.current || !layersRef.current) return;

    layersRef.current.clearLayers();

    markers.forEach((m) => {
      L.marker([m.lat, m.lng])
        .addTo(layersRef.current!)
        .bindPopup(popupContent(m.popupText));
    });
  }, [markers, ready]);

  useEffect(() => {
    const L = LRef.current;
    if (
      !ready ||
      !L ||
      !mapInstance.current ||
      !currentLocationLayerRef.current
    )
      return;

    currentLocationLayerRef.current.clearLayers();

    if (currentLocation) {
      const { lat, lng } = currentLocation;
      const here = L.circleMarker([lat, lng], {
        radius: 8,
        weight: 2,
        color: '#b91c1c',
        fillColor: '#ef4444',
        fillOpacity: 1,
        pane: 'currentLocation',
      }).addTo(currentLocationLayerRef.current);
      if (currentLocation.popupText)
        here.bindPopup(popupContent(currentLocation.popupText));
    }
  }, [currentLocation, ready]);

  useEffect(() => {
    const L = LRef.current;
    if (!ready || !L || !mapInstance.current || hasInitialFit.current) return;

    const points: Array<import('leaflet').LatLngExpression> = markers.map(
      (m) => [m.lat, m.lng],
    );
    if (currentLocation)
      points.push([currentLocation.lat, currentLocation.lng]);

    if (points.length > 0) {
      fitToPoints(mapInstance.current, L, points);
      hasInitialFit.current = true;
    }
  }, [markers, currentLocation, ready]);

  useEffect(() => {
    const L = LRef.current;
    const map = mapInstance.current;
    if (!ready || !L || !map) return;
    if (!command) return;

    runCommand(map, L, command, markersRef.current, currentLocRef.current);
  }, [command, ready]);

  // Leaflet caches the container size, so a map whose box changes while
  // mounted -- rotation, the mobile URL bar collapsing, the on-screen
  // keyboard -- renders into stale dimensions and leaves grey tiles until
  // told to re-measure.
  useEffect(() => {
    if (!ready) return;
    const el = mapRef.current;
    const map = mapInstance.current;
    if (!el || !map) return;

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);
    return () => observer.disconnect();
  }, [ready]);

  return <div ref={mapRef} style={{ height: '100%', width: '100%' }} />;
};

export default Map;
