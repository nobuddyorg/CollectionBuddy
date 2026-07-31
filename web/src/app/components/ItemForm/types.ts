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

export type ItemFormValues = {
  title: string;
  description: string;
  place: string;
  // Null whenever `place` wasn't picked from a suggestion. The two travel
  // together: anything that changes `place` must set these to match, or a
  // pin outlives the name it belonged to.
  place_lat: number | null;
  place_lng: number | null;
  tags: string[];
};

export type ItemFormProps = {
  initial: ItemFormValues;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (values: ItemFormValues) => void;
  onCancel?: () => void;
};
