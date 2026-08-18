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

/**
 * What picking a suggestion produces: the label to show, and where it is.
 *
 * `coords` is null when the gazetteer's answer had no usable geometry; the
 * label is still worth keeping, it just has to be geocoded later like any
 * hand-typed place.
 */
export type PlaceChoice = { label: string; coords: PlaceCoords | null };

// `description`/`place` are widened to plain `string`: the database stores
// blank as NULL, but a controlled input needs to hold something, and every
// caller normalizes null to '' at the boundary. `place_lat`/`place_lng`
// travel with `place`: anything that changes `place` must set these to
// match, or a pin outlives the name it belonged to.
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
  /** Reported whenever any field's value stops (or resumes) matching
   * `initial`, so a caller can confirm before a backdrop tap or Escape
   * silently discards it. */
  onDirtyChange?: (dirty: boolean) => void;
};
