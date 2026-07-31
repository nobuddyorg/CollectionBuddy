export type Leaflet = typeof import('leaflet');

export type IconDefaultPrivate = import('leaflet').Icon.Default & {
  _getIconUrl?: () => string;
};

export interface MarkerInput {
  lat: number;
  lng: number;
  popupText: string;
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

export interface Place {
  name: string;
  lat: number;
  lng: number;
}
