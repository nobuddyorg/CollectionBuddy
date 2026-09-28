import type { Icon } from 'leaflet';
import type { Coordinates } from '../../lib/coordinates';

export type Leaflet = typeof import('leaflet');

export type IconDefaultPrivate = Icon.Default & {
  _getIconUrl?: () => string;
};

export interface MarkerInput extends Coordinates {
  popupText: string;
  /** The entries catalogued at this place, named under it in the popup. */
  titles: string[];
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
  currentLocation?: Coordinates & { popupText: string };
  command?: MapCommand | null;
  /** Already translated, as countLabel is; read once, as the language cannot change while the map is open. */
  labels: { zoomIn: string; zoomOut: string; attribution: string };
}

/** Exactly what the geocode cache holds: coordinates stay true whatever entries are catalogued there. */
export interface PlaceCoords extends Coordinates {
  name: string;
}

/** A located place together with the entries catalogued there. */
export interface Place extends PlaceCoords {
  titles: string[];
}
