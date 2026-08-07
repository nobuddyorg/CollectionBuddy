'use client';
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import {
  IconDefaultPrivate,
  Leaflet,
  MapCommandKind,
  MapProps,
  MarkerInput,
} from './types';

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

/**
 * A pin's popup: the place, and the entries catalogued there (#404).
 *
 * Built as DOM rather than markup because Leaflet binds a node, not a React
 * tree -- and every string in here is user-entered, so each one is set with
 * `textContent`. A title is a value this app stored faithfully; it must
 * never be a value this app parses as HTML.
 *
 * Deliberately not themed. A popup floats over map tiles, which are the
 * same paper colour whichever theme the app is in, so it keeps Leaflet's
 * own light styling in both rather than turning charcoal over a light map.
 */
const popupContent = (
  text: string,
  titles?: string[],
  countLabel?: string,
): HTMLDivElement => {
  const el = document.createElement('div');

  const heading = document.createElement('p');
  heading.className = 'font-display text-sm font-bold';
  heading.textContent = text;
  el.appendChild(heading);

  if (countLabel) {
    const count = document.createElement('p');
    count.className = 'font-label text-[0.6875rem] text-neutral-500';
    count.textContent = countLabel;
    el.appendChild(count);
  }

  if (titles?.length) {
    // Scrolls rather than truncates: the ask was the titles of *all* the
    // collectibles at a place, and a pin standing for thirty of them should
    // still be able to name the thirtieth. The cap is on the popup's
    // height, not on the collection.
    const list = document.createElement('ul');
    list.className = 'mt-1.5 max-h-40 overflow-y-auto list-disc pl-4';
    for (const title of titles) {
      const item = document.createElement('li');
      item.textContent = title;
      list.appendChild(item);
    }
    el.appendChild(list);
  }

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

// The one way the view is ever framed on command. There used to be a second
// entry point for a command that arrived before the map had finished
// initialising, which is two ways for the zoom to drift apart; a command that
// is never withdrawn is simply still there to be read when the map is ready,
// so the effect below covers both cases on its own.
const runCommand = (
  map: import('leaflet').Map,
  L: Leaflet,
  command: MapCommandKind,
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

  const markersRef = useRef(markers);
  const currentLocRef = useRef(currentLocation);

  const [ready, setReady] = useState(false);
  const hasInitialFit = useRef(false);

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
        .bindPopup(popupContent(m.popupText, m.titles, m.countLabel));
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

  // The opening frame, so the map does not sit on a world view while the
  // pins are still being geocoded. It waits for a pin: the location dot on
  // its own is not a collection, and framing a single point puts the viewer
  // on their own doorstep at maximum zoom with nothing else in sight.
  //
  // That was the second-open bug. The map remounts every time the modal is
  // opened, but the geolocation fix does not -- it is held by the page
  // above, so on the second open it is already in hand while the pins are
  // being re-read. This effect fired with one point, framed it, and latched,
  // and the map opened zoomed to the dot.
  useEffect(() => {
    const L = LRef.current;
    if (!ready || !L || !mapInstance.current || hasInitialFit.current) return;
    if (markers.length === 0) return;

    const points: Array<import('leaflet').LatLngExpression> = markers.map(
      (m) => [m.lat, m.lng],
    );
    if (currentLocation)
      points.push([currentLocation.lat, currentLocation.lng]);

    fitToPoints(mapInstance.current, L, points);
    hasInitialFit.current = true;
  }, [markers, currentLocation, ready]);

  // Runs on the command *or* on becoming ready, which is how an instruction
  // issued before Leaflet had loaded still gets carried out rather than
  // being missed. Re-measuring first: a fit computed against a container
  // Leaflet has not sized yet frames the wrong box.
  useEffect(() => {
    const L = LRef.current;
    const map = mapInstance.current;
    if (!ready || !L || !map || !command) return;

    const frame = requestAnimationFrame(() => {
      map.invalidateSize();
      runCommand(
        map,
        L,
        command.kind,
        markersRef.current,
        currentLocRef.current,
      );
    });
    return () => cancelAnimationFrame(frame);
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
