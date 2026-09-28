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
import { afterZoomAnimation, removeMidZoom } from './afterZoomAnimation';
import { diffMarkers } from './markerDiff';
import {
  type CopyRange,
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

// Typed as StaticImageData, but Turbopack hands a node_modules image over as its URL string.
const toUrl = (imported: unknown): string => {
  if (typeof imported === 'string') return imported;
  const withSrc = imported as { src?: string };
  if (withSrc && typeof withSrc.src === 'string') return withSrc.src;
  throw new Error('Unsupported image import format');
};

const BOUNDS_PAD_RATIO = 0.015;

const OSM_COPYRIGHT_LINK =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

type LoadedMap = {
  L: Leaflet;
  map: LeafletMap;
  pinLayer: LayerGroup;
  currentLocationLayer: LayerGroup;
};

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
      .bindPopup(() => popupContent(marker)),
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
const CURRENT_LOCATION_PANE_Z_INDEX = '650'; // Between Leaflet's marker (600) and popup (700) panes.

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
  { L, map }: Pick<LoadedMap, 'L' | 'map'>,
  points: LatLngExpression[],
): void => {
  if (points.length === 0) return;
  const bounds = L.latLngBounds(points).pad(BOUNDS_PAD_RATIO);
  if (bounds.isValid()) map.fitBounds(bounds, FIT_OPTIONS);
};

// Reports whether it framed anything, as a fit with no points is a no-op.
const runCommand = (
  loaded: Pick<LoadedMap, 'L' | 'map'>,
  {
    command,
    markers,
    currentLocation,
  }: {
    command: MapCommandKind;
    markers: MarkerInput[];
    currentLocation: MapProps['currentLocation'];
  },
): boolean => {
  if (command === 'fitAll') {
    const points: LatLngExpression[] = markers.map((marker) => [
      marker.lat,
      marker.lng,
    ]);
    if (currentLocation)
      points.push([currentLocation.lat, currentLocation.lng]);
    fitToPoints(loaded, points);
    return points.length > 0;
  }
  if (!currentLocation) return false;
  const { L, map } = loaded;
  const { lat, lng } = currentLocation;
  map.fitBounds(
    L.latLng(lat, lng).toBounds(CURRENT_LOCATION_SPAN_M),
    FIT_OPTIONS,
  );
  return true;
};

const MapView: React.FC<MapProps> = ({
  markers,
  currentLocation,
  command,
  labels,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const drawnMarkersRef = useRef<DrawnMarkers>(noDrawnMarkers());
  const markersRef = useSyncedRef(markers);
  const currentLocationRef = useSyncedRef(currentLocation);
  const labelsRef = useSyncedRef(labels);

  const [loaded, setLoaded] = useState<LoadedMap | null>(null);
  const hasInitialFit = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let sizeFrame = 0;
    let map: LeafletMap | undefined;
    void (async () => {
      if (!containerRef.current) return;

      const L = (await import('leaflet')).default;
      if (cancelled) return;

      delete (L.Icon.Default.prototype as IconDefaultPrivate)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: toUrl(iconRetinaUrl),
        iconUrl: toUrl(iconUrl),
        shadowUrl: toUrl(shadowUrl),
      });

      // A world view fetches no tiles the fit would discard; worldCopyJump keeps pins on the primary copy.
      map = L.map(containerRef.current, {
        worldCopyJump: true,
        zoomControl: false,
      }).setView([20, 0], 2);
      map.createPane('currentLocation').style.zIndex =
        CURRENT_LOCATION_PANE_Z_INDEX;

      const { zoomIn, zoomOut, attribution } = labelsRef.current;
      L.control.zoom({ zoomInTitle: zoomIn, zoomOutTitle: zoomOut }).addTo(map);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: `${OSM_COPYRIGHT_LINK} ${attribution}`,
      }).addTo(map);

      const loadedMap: LoadedMap = {
        L,
        map,
        pinLayer: L.layerGroup().addTo(map),
        currentLocationLayer: L.layerGroup().addTo(map),
      };
      setLoaded(loadedMap);
      sizeFrame = requestAnimationFrame(() => loadedMap.map.invalidateSize());
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(sizeFrame);
      if (map) removeMidZoom(map);
      drawnMarkersRef.current = noDrawnMarkers();
      setLoaded(null);
    };
  }, [labelsRef]);

  useEffect(() => {
    if (!loaded) return;
    const { L, map, pinLayer } = loaded;

    const drawn = drawnMarkersRef.current;
    const render = () => {
      const range = visibleCopyRange(map.getBounds());
      // A new copy range redraws every pin; otherwise only what changed.
      if (!sameRange(drawn.range, range)) {
        pinLayer.clearLayers();
        drawn.byKey.clear();
        drawn.range = range;
      }
      const { add, removeKeys } = diffMarkers(
        new Set(drawn.byKey.keys()),
        markers,
      );
      for (const key of removeKeys) {
        drawn.byKey.get(key)!.forEach((pin) => pinLayer.removeLayer(pin));
        drawn.byKey.delete(key);
      }
      const [copyMin, copyMax] = range;
      const offsets = copyOffsets(copyMin, copyMax);
      for (const [key, marker] of add) {
        drawn.byKey.set(key, drawPins(L, { layer: pinLayer, marker, offsets }));
      }
    };

    render();
    map.on('moveend zoomend', render);
    return () => {
      map.off('moveend zoomend', render);
    };
  }, [markers, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const { L, map, currentLocationLayer } = loaded;

    let drawnRange: CopyRange | null = null;

    const render = () => {
      const range = visibleCopyRange(map.getBounds());
      if (sameRange(drawnRange, range)) return;
      drawnRange = range;

      currentLocationLayer.clearLayers();
      if (!currentLocation) return;

      const { lat, lng, popupText } = currentLocation;
      const [copyMin, copyMax] = range;
      for (const offset of copyOffsets(copyMin, copyMax)) {
        L.marker([lat, lng + offset], {
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
        })
          .addTo(currentLocationLayer)
          .bindPopup(() => popupContent({ popupText }));
      }
    };

    render();
    map.on('moveend zoomend', render);
    return () => {
      map.off('moveend zoomend', render);
    };
  }, [currentLocation, loaded]);

  // Waits for a pin: framing the location dot alone drops the viewer on their own doorstep.
  useEffect(() => {
    if (!loaded || hasInitialFit.current || markers.length === 0) return;
    runCommand(loaded, { command: 'fitAll', markers, currentLocation });
    hasInitialFit.current = true;
  }, [markers, currentLocation, loaded]);

  // Also runs once the map has loaded, so a command issued before that is still carried out.
  useEffect(() => {
    if (!loaded || !command) return;
    const { map } = loaded;

    const framing = () => {
      // A fit against a container Leaflet has not sized yet frames the wrong box.
      map.invalidateSize();
      const framed = runCommand(loaded, {
        command: command.kind,
        markers: markersRef.current,
        currentLocation: currentLocationRef.current,
      });
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
  }, [command, loaded, markersRef, currentLocationRef]);

  // Leaflet caches the container size, so a resize while mounted leaves grey tiles until re-measured.
  useEffect(() => {
    const element = containerRef.current;
    if (!loaded || !element) return;

    const observer = new ResizeObserver(() => loaded.map.invalidateSize());
    observer.observe(element);
    return () => observer.disconnect();
  }, [loaded]);

  return <div ref={containerRef} style={{ height: '100%', width: '100%' }} />;
};

export default MapView;
