import type { ImageEntryData } from './imageEntries';

// Seven photographs of one item: more than a card's hero and strip can show.
export function sevenPhotos(): Map<string, ImageEntryData> {
  return new Map(
    Array.from({ length: 7 }, (_, i) => [
      `img-${i}`,
      {
        id: `img-${i}`,
        pathFull: `p/${i}.webp`,
        pathThumb: `p/${i}.thumb.webp`,
      },
    ]),
  );
}
