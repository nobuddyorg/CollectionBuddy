export type { ItemFields as ItemLite } from '../../data/items';

export type ImgEntry = {
  id: string;
  pathFull: string;
  /** Unset for a photograph past the card's plates until the carousel asks. */
  urlFull?: string;
  pathThumb?: string;
  urlThumb?: string;
};
