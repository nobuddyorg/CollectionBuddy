import type { ItemFields } from '../../data/items';

export type PhotonFeature = {
  properties: {
    osm_id: number;
    osm_type: string;
    osm_key: string;
    osm_value: string;
    name?: string;
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    postcode?: string;
  };
  geometry: { type: 'Point'; coordinates: [number, number] };
};

export type PlaceCoords = { lat: number; lng: number };

/** `coords` is null when the gazetteer's answer had no usable geometry; the label is still kept. */
export type PlaceChoice = { label: string; coords: PlaceCoords | null };

// Widened to plain `string`: the database stores blank as NULL, but a controlled input needs a value.
export type ItemFormValues = Omit<
  ItemFields,
  'id' | 'description' | 'place'
> & {
  description: string;
  place: string;
};

export const EMPTY_ITEM_FORM_VALUES: ItemFormValues = {
  title: '',
  description: '',
  place: '',
  place_lat: null,
  place_lng: null,
  tags: [],
};

export type ItemFormProps = {
  initial: ItemFormValues;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (values: ItemFormValues) => void;
  onCancel?: () => void;
  /** Reported whenever any field stops (or resumes) matching `initial`, so a caller can confirm a discard. */
  onDirtyChange?: (dirty: boolean) => void;
};
