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

export type ItemFormValues = {
  title: string;
  description: string;
  place: string;
  tags: string[];
};

export type ItemFormProps = {
  initial: ItemFormValues;
  submitting?: boolean;
  submitLabel: string;
  onSubmit: (values: ItemFormValues) => void;
  onCancel?: () => void;
  showIconSubmit?: boolean;
};
