'use client';
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';

import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { popupContent } from './popup';
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

// worldCopyJump (below) keeps the view within one world-width of the
// primary copy, but a marker is only ever placed at its one true
// coordinate -- so panning onto a repeated copy of the tile layer showed
// an empty repeat until the jump snapped back. Rendering each marker once
// per visible world copy, recomputed from the map's own bounds rather than
// a fixed count, keeps a pin on screen at whatever pan position the viewer
// is looking at, and scales itself if the viewport ever spans more than
// three copies (a very wide window at a low zoom).
const WORLD_WIDTH_DEG = 360;

const visibleCopyRange = (
  bounds: import('leaflet').LatLngBounds,
): [number, number] => [
  Math.floor(bounds.getWest() / WORLD_WIDTH_DEG),
  Math.floor(bounds.getEast() / WORLD_WIDTH_DEG),
];

const sameRange = (
  a: [number, number] | null,
  b: [number, number],
): boolean => a !== null && a[0] === b[0] && a[1] === b[1];

// A ceiling for every automatic fit. Pins are geocoded from a place *name*
// ("Cologne"), so they are only ever city-accurate -- and fitBounds, left
// alone, frames a single pin or a tight cluster at the tile layer's maximum
// zoom, dropping the viewer onto a rooftop that the underlying data never
// claimed. Zoom 12 shows the city the pin actually means.
const FIT_MAX_ZOOM = 12;

// Width of the box "zoom to me" frames around the current position: a
// regional view, so the surrounding pins stay in the picture.
const CURRENT_LOCATION_SPAN_M = 100000;

// The dot used to be an L.circleMarker, a vector path whose radius is
// pixels rather than a projected distance. Leaflet's zoom animation scales
// the whole overlay pane by CSS transform for the gesture's duration and
// only re-projects paths at zoomend, so a pixel-radius circle visibly
// ballooned or shrank mid-zoom before snapping back. A divIcon marker is
// repositioned by translate only during that same animation -- its size
// never moves -- so it holds a constant 16px dot throughout the gesture.
const CURRENT_LOCATION_DIAMETER = 16;
const CURRENT_LOCATION_STROKE = '#b91c1c';
const CURRENT_LOCATION_FILL = '#ef4444';

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
    void (async () => {
      if (!mapRef.current || mapInstance.current) return;
      if (typeof window === 'undefined') return;

      const L = (await import('leaflet')).default;
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
      //
      // worldCopyJump snaps the view back to the primary copy of the world
      // once a pan crosses into a repeated one -- without it the tile layer
      // keeps repeating forever as you scroll, but pins and the current
      // location dot only exist on the original copy, so they vanish the
      // moment the view drifts past it.
      const map = L.map(mapRef.current, { worldCopyJump: true }).setView(
        [20, 0],
        2,
      );
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
    const map = mapInstance.current;
    const layer = layersRef.current;
    if (!ready || !L || !map || !layer) return;

    const copyRangeRef = { current: null as [number, number] | null };

    const render = () => {
      const range = visibleCopyRange(map.getBounds());
      if (sameRange(copyRangeRef.current, range)) return;
      copyRangeRef.current = range;

      layer.clearLayers();
      const [copyMin, copyMax] = range;
      for (let copy = copyMin; copy <= copyMax; copy++) {
        markers.forEach((m) => {
          L.marker([m.lat, m.lng + copy * WORLD_WIDTH_DEG])
            .addTo(layer)
            // A function, not a built element: at most one popup is ever
            // open, but every geocode landing rebuilds every marker on the
            // map (this effect re-runs per streamed-in place, not once at
            // the end), so constructing the content eagerly meant building
            // the full titles list for every pin on every one of those
            // rebuilds instead of only the one a reader actually opens.
            .bindPopup(() => popupContent(m.popupText, m.titles, m.countLabel));
        });
      }
    };

    render();
    map.on('moveend zoomend', render);
    return () => {
      map.off('moveend zoomend', render);
    };
  }, [markers, ready]);

  useEffect(() => {
    const L = LRef.current;
    const map = mapInstance.current;
    const layer = currentLocationLayerRef.current;
    if (!ready || !L || !map || !layer) return;

    const copyRangeRef = { current: null as [number, number] | null };

    const render = () => {
      const range = visibleCopyRange(map.getBounds());
      if (sameRange(copyRangeRef.current, range)) return;
      copyRangeRef.current = range;

      layer.clearLayers();
      if (!currentLocation) return;

      const { lat, lng, popupText } = currentLocation;
      const [copyMin, copyMax] = range;
      for (let copy = copyMin; copy <= copyMax; copy++) {
        const here = L.marker([lat, lng + copy * WORLD_WIDTH_DEG], {
          // className: '' strips Leaflet's default divIcon box (a white
          // square with its own border) so only the dot below is drawn.
          icon: L.divIcon({
            className: '',
            html: `<div style="width:100%;height:100%;box-sizing:border-box;border-radius:9999px;background:${CURRENT_LOCATION_FILL};border:2px solid ${CURRENT_LOCATION_STROKE};"></div>`,
            iconSize: [CURRENT_LOCATION_DIAMETER, CURRENT_LOCATION_DIAMETER],
            iconAnchor: [
              CURRENT_LOCATION_DIAMETER / 2,
              CURRENT_LOCATION_DIAMETER / 2,
            ],
          }),
          pane: 'currentLocation',
        }).addTo(layer);
        // Narrowed to a local const: TS can't carry the `if` guard's
        // narrowing of `currentLocation.popupText` through the closure below.
        if (popupText) here.bindPopup(() => popupContent(popupText));
      }
    };

    render();
    map.on('moveend zoomend', render);
    return () => {
      map.off('moveend zoomend', render);
    };
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
