import type { Icon } from 'leaflet';

export type Leaflet = typeof import('leaflet');

export type IconDefaultPrivate = Icon.Default & {
  _getIconUrl?: () => string;
};

export interface MarkerInput {
  lat: number;
  lng: number;
  popupText: string;
  /** The entries catalogued at this place, named under it in the popup. */
  titles?: string[];
  /** Already translated: the map draws Leaflet layers, not React, and has no i18n of its own. */
  countLabel?: string;
}

export type MapCommandKind = 'fitAll' | 'fitCurrent';

/** Numbered so the same command issued twice still reads as a change, and standing until the map can obey. */
export interface MapCommand {
  kind: MapCommandKind;
  id: number;
}

export interface MapProps {
  markers: MarkerInput[];
  currentLocation?: { lat: number; lng: number; popupText?: string };
  command?: MapCommand | null;
}

/** Exactly what the geocode cache holds: coordinates stay true whatever entries are catalogued there. */
export interface PlaceCoords {
  name: string;
  lat: number;
  lng: number;
}

/** A located place together with the entries catalogued there. */
export interface Place extends PlaceCoords {
  titles: string[];
}
