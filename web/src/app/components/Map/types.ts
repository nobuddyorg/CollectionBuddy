export type Leaflet = typeof import('leaflet');

export type IconDefaultPrivate = import('leaflet').Icon.Default & {
  _getIconUrl?: () => string;
};

export interface MarkerInput {
  lat: number;
  lng: number;
  popupText: string;
  /**
   * The entries catalogued at this place, named under it in the popup
   * (#404). A pin stands for what is there, not just for where there is.
   */
  titles?: string[];
  /**
   * How many entries, already translated. The map is a leaf component with
   * no i18n of its own -- it draws Leaflet layers rather than React, so the
   * caller, which has `t`, does the counting and the wording.
   */
  countLabel?: string;
}

export type MapCommandKind = 'fitAll' | 'fitCurrent';

/**
 * A request to frame the view, and a number saying which request it is.
 *
 * The counter is the whole point. A command used to be a bare string that
 * the caller took back on a 0ms timeout, so that issuing the same one twice
 * running still read as a change. That made every command a pulse one tick
 * wide, and a map that had not finished loading Leaflet within that tick
 * never saw it. The number lets a command be repeated without ever being
 * withdrawn, so it is still standing whenever the map becomes able to obey.
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
 * Where a place is, and nothing else.
 *
 * Kept separate from `Place` below because this is exactly what the
 * geocode cache in localStorage holds and all it may hold: coordinates for
 * a name are true until the world moves, whereas the entries catalogued
 * there change every time one is added or deleted. Caching those too would
 * have the map naming yesterday's collection.
 */
export interface PlaceCoords {
  name: string;
  lat: number;
  lng: number;
}

/** A located place together with the entries catalogued there (#404). */
export interface Place extends PlaceCoords {
  titles: string[];
}
