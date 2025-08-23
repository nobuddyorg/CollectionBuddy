export type Leaflet = typeof import('leaflet');

export type IconDefaultPrivate = import('leaflet').Icon.Default & {
  _getIconUrl?: () => string;
};

export interface MarkerInput {
  lat: number;
  lng: number;
  popupText: string;
}

export interface MapProps {
  markers: MarkerInput[];
  currentLocation?: { lat: number; lng: number; popupText?: string };
  command?: 'fitAll' | 'fitCurrent' | null;
}

export interface Place {
  name: string;
  lat: number;
  lng: number;
}
