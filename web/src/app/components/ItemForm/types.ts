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
 * `coords` is null when the gazetteer's answer had no usable geometry --
 * the label is still worth keeping, it just has to be geocoded later like
 * any hand-typed place.
 */
export type PlaceChoice = { label: string; coords: PlaceCoords | null };

// Tied to the table's own field list (`data/items.ts`) rather than a
// separate hand-written copy of the same six names, so the compiler
// connects the form to the row it edits. `description`/`place` are widened
// back to plain `string`: the database stores blank as NULL, but a
// controlled input has to hold *something*, and every caller already
// normalizes null to '' at the boundary (see EditItemModal's `valuesFor`).
// `place_lat`/`place_lng` stay null-or-number as `ItemFields` already has
// them -- null whenever `place` wasn't picked from a suggestion. The two
// travel together: anything that changes `place` must set these to match,
// or a pin outlives the name it belonged to.
export type ItemFormValues = Omit<
  ItemFields,
  'id' | 'description' | 'place'
> & {
  description: string;
  place: string;
};

// Shared by every entry point that opens the form with nothing to show yet
// (a new entry, or a modal about to receive an item) -- was two
// byte-identical literals, one per caller.
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
   * `initial` -- so a caller closing the surrounding modal can ask before
   * discarding it (#308) instead of a backdrop tap or Escape losing it
   * silently. */
  onDirtyChange?: (dirty: boolean) => void;
};
