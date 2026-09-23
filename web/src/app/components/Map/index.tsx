'use client';
import { useEffect, useRef, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import type {
  FitBoundsOptions,
  LatLngExpression,
  LayerGroup,
  Map as LeafletMap,
  Marker,
} from 'leaflet';

import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { popupContent } from './popup';
import { afterZoomAnimation } from './afterZoomAnimation';
import { diffMarkers } from './markerDiff';
import {
  type CopyRange,
  WORLD_WIDTH_DEG,
  copyOffsets,
  sameRange,
  visibleCopyRange,
} from './worldCopies';
import { useSyncedRef } from '../../lib/useSyncedRef';
import {
  IconDefaultPrivate,
  Leaflet,
  MapCommandKind,
  MapProps,
  MarkerInput,
} from './types';

const toUrl = (imported: unknown): string => {
  if (typeof imported === 'string') return imported;
  const withSrc = imported as { src?: string };
  if (withSrc && typeof withSrc.src === 'string') return withSrc.src;
  throw new Error('Unsupported image import format');
};

const BOUNDS_PAD_RATIO = 0.015;

/** The pins on the map across effect runs: their copy range, and each marker's pins under its key. */
type DrawnMarkers = {
  range: CopyRange | null;
  byKey: Map<string, Marker[]>;
};

/** One pin per world-copy offset; the popup is a function, so it is only built for a pin that opens. */
const drawPins = (
  L: Leaflet,
  target: {
    layer: LayerGroup;
    marker: MarkerInput;
    offsets: number[];
  },
): Marker[] => {
  const { layer, marker, offsets } = target;
  return offsets.map((offset) =>
    L.marker([marker.lat, marker.lng + offset])
      .addTo(layer)
      .bindPopup(() =>
        popupContent(marker.popupText, marker.titles, marker.countLabel),
      ),
  );
};

const noDrawnMarkers = (): DrawnMarkers => ({
  range: null,
  byKey: new Map<string, Marker[]>(),
});

// Pins are geocoded from a place name, so a fit stops at the city rather than a rooftop.
const FIT_MAX_ZOOM = 12;

// Width of the box "zoom to me" frames: a regional view, so the surrounding pins stay in the picture.
const CURRENT_LOCATION_SPAN_M = 100000;

// A divIcon, not a circleMarker: Leaflet's zoom animation scales vector paths mid-zoom, a divIcon not.
const CURRENT_LOCATION_DIAMETER = 16;
const CURRENT_LOCATION_STROKE = '#b91c1c';
const CURRENT_LOCATION_FILL = '#ef4444';

// A 25x41 icon rises above its anchor, and the top must also clear the map's 36px controls.
const MARKER_ICON_HEIGHT = 41;
const MARKER_ICON_HALF_WIDTH = 13;
const CONTROLS_BOTTOM_EDGE = 44;

const FIT_OPTIONS: FitBoundsOptions = {
  paddingTopLeft: [
    MARKER_ICON_HALF_WIDTH,
    Math.max(MARKER_ICON_HEIGHT, CONTROLS_BOTTOM_EDGE),
  ],
  paddingBottomRight: [MARKER_ICON_HALF_WIDTH, 8],
  maxZoom: FIT_MAX_ZOOM,
};

const fitToPoints = (
  map: LeafletMap,
  L: Leaflet,
  points: Array<LatLngExpression>,
): void => {
  if (points.length === 0) return;
  const bounds = L.latLngBounds(points).pad(BOUNDS_PAD_RATIO);
  if (bounds.isValid()) map.fitBounds(bounds, FIT_OPTIONS);
};

// Reports whether it framed anything, as a fit with no points is a no-op.
const runCommand = (
  map: LeafletMap,
  L: Leaflet,
  command: MapCommandKind,
  markers: MarkerInput[],
  currentLocation: MapProps['currentLocation'],
): boolean => {
  if (command === 'fitAll') {
    const points: Array<LatLngExpression> = markers.map((marker) => [
      marker.lat,
      marker.lng,
    ]);
    if (currentLocation)
      points.push([currentLocation.lat, currentLocation.lng]);
    fitToPoints(map, L, points);
    return points.length > 0;
  }
  if (!currentLocation) return false;
  const { lat, lng } = currentLocation;
  map.fitBounds(
    L.latLng(lat, lng).toBounds(CURRENT_LOCATION_SPAN_M),
    FIT_OPTIONS,
  );
  return true;
};

const MapView: React.FC<MapProps> = ({ markers, currentLocation, command }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletRef = useRef<Leaflet | null>(null);
  const mapInstance = useRef<LeafletMap | null>(null);
  const layersRef = useRef<LayerGroup | null>(null);
  const currentLocationLayerRef = useRef<LayerGroup | null>(null);

  const drawnMarkersRef = useRef<DrawnMarkers>(noDrawnMarkers());
  const markersRef = useSyncedRef(markers);
  const currentLocationRef = useSyncedRef(currentLocation);

  const [ready, setReady] = useState(false);
  const hasInitialFit = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!mapRef.current || mapInstance.current) return;
      if (typeof window === 'undefined') return;

      const L = (await import('leaflet')).default;
      if (cancelled) return;
      leafletRef.current = L;

      delete (L.Icon.Default.prototype as IconDefaultPrivate)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: toUrl(iconRetinaUrl),
        iconUrl: toUrl(iconUrl),
        shadowUrl: toUrl(shadowUrl),
      });

      // A world view fetches no tiles the fit would discard; worldCopyJump keeps pins on the primary copy.
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
      drawnMarkersRef.current = noDrawnMarkers();
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapInstance.current;
    const layer = layersRef.current;
    if (!ready || !L || !map || !layer) return;

    const drawn = drawnMarkersRef.current;
    const render = () => {
      const range = visibleCopyRange(map.getBounds());
      // A new copy range redraws every pin; otherwise only what changed.
      if (!sameRange(drawn.range, range)) {
        layer.clearLayers();
        drawn.byKey.clear();
        drawn.range = range;
      }
      const { add, removeKeys } = diffMarkers(
        new Set(drawn.byKey.keys()),
        markers,
      );
      for (const key of removeKeys) {
        drawn.byKey.get(key)!.forEach((pin) => layer.removeLayer(pin));
        drawn.byKey.delete(key);
      }
      const [copyMin, copyMax] = range;
      const offsets = copyOffsets(copyMin, copyMax);
      for (const [key, marker] of add) {
        drawn.byKey.set(key, drawPins(L, { layer, marker, offsets }));
      }
    };

    render();
    map.on('moveend zoomend', render);
    return () => {
      map.off('moveend zoomend', render);
    };
  }, [markers, ready]);

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapInstance.current;
    const layer = currentLocationLayerRef.current;
    if (!ready || !L || !map || !layer) return;

    const copyRangeRef = { current: null as CopyRange | null };

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
          // className: '' strips Leaflet's default divIcon box so only the dot below is drawn.
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
        // A local const: TS cannot carry the guard's narrowing of `popupText` into the closure.
        if (popupText) here.bindPopup(() => popupContent(popupText));
      }
    };

    render();
    map.on('moveend zoomend', render);
    return () => {
      map.off('moveend zoomend', render);
    };
  }, [currentLocation, ready]);

  // Waits for a pin: framing the location dot alone drops the viewer on their own doorstep.
  useEffect(() => {
    const L = leafletRef.current;
    if (!ready || !L || !mapInstance.current || hasInitialFit.current) return;
    if (markers.length === 0) return;

    const points: Array<LatLngExpression> = markers.map((marker) => [
      marker.lat,
      marker.lng,
    ]);
    if (currentLocation)
      points.push([currentLocation.lat, currentLocation.lng]);

    fitToPoints(mapInstance.current, L, points);
    hasInitialFit.current = true;
  }, [markers, currentLocation, ready]);

  // Also runs on becoming ready, so a command issued before Leaflet loaded is still carried out.
  useEffect(() => {
    const L = leafletRef.current;
    const map = mapInstance.current;
    if (!ready || !L || !map || !command) return;

    const framing = () => {
      // A fit against a container Leaflet has not sized yet frames the wrong box.
      map.invalidateSize();
      const framed = runCommand(
        map,
        L,
        command.kind,
        markersRef.current,
        currentLocationRef.current,
      );
      // A command that framed the view outranks the one-shot fit on the first pin.
      if (framed) hasInitialFit.current = true;
    };
    let cancelWait = () => {};
    const frame = requestAnimationFrame(() => {
      cancelWait = afterZoomAnimation(map, framing);
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelWait();
    };
  }, [command, ready, markersRef, currentLocationRef]);

  // Leaflet caches the container size, so a resize while mounted leaves grey tiles until re-measured.
  useEffect(() => {
    if (!ready) return;
    const element = mapRef.current;
    const map = mapInstance.current;
    if (!element || !map) return;

    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready]);

  return <div ref={mapRef} style={{ height: '100%', width: '100%' }} />;
};

export default MapView;
