export type ItemRow = {
  id: string;
  title: string;
  description: string | null;
  place: string | null;
  tags: string[] | null;
  item_categories: { category_id: string }[];
};

export type ItemLite = {
  id: string;
  title: string;
  description: string | null;
  place: string | null;
  tags: string[];
};

export type ImgEntry = {
  pathFull: string;
  urlFull: string;
  pathThumb?: string;
  urlThumb?: string;
};
