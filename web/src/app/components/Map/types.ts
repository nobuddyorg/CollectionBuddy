export type Leaflet = typeof import('leaflet');

export type IconDefaultPrivate = import('leaflet').Icon.Default & {
  _getIconUrl?: () => string;
};

export interface MarkerInput {
  lat: number;
  lng: number;
  popupText: string;
  /** The entries catalogued at this place, named under it in the popup. */
  titles?: string[];
  /** Already translated: the map draws Leaflet layers, not React, and has
   * no i18n of its own. */
  countLabel?: string;
}

export type MapCommandKind = 'fitAll' | 'fitCurrent';

/**
 * A request to frame the view, plus a counter identifying which request it
 * is -- so issuing the same command twice still reads as a change, and it
 * stays standing (not withdrawn on a timeout) until the map is able to obey.
 */
export interface MapCommand {
  kind: MapCommandKind;
  id: number;
}

export interface MapProps {
  markers: MarkerInput[];
  currentLocation?: { lat: number; lng: number; popupText?: string };
  command?: MapCommand | null;
}

/**
 * Where a place is, and nothing else. Separate from `Place` below because
 * this is exactly what the geocode cache holds: coordinates stay true
 * regardless of which entries are catalogued there.
 */
export interface PlaceCoords {
  name: string;
  lat: number;
  lng: number;
}

/** A located place together with the entries catalogued there. */
export interface Place extends PlaceCoords {
  titles: string[];
}
