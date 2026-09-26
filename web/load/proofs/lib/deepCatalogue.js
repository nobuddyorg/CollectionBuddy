// One large category, every tenth entry photographed: the seed the deep-page proofs share.
import encoding from 'k6/encoding';

import { NOUNS } from '../../lib/seed.js';
import {
  TINY_WEBP_BASE64,
  attachPhotos,
  envInt,
  insertEntries,
  newCategory,
  newCollector,
  seedOrClear,
} from './fixtures.js';

// 40,000 is the issue's figure and stays under the 50,000-entry owner quota.
export const ENTRIES = envInt('PROOF_ENTRIES', 40000);
export const PHOTO_EVERY = envInt('PROOF_PHOTO_EVERY', 10);
export const PAGE_SIZE = 9;
export const LAST_PAGE = Math.ceil(ENTRIES / PAGE_SIZE);

export function seedDeepCatalogue(label) {
  const owner = newCollector(label);
  return seedOrClear([owner], () => {
    const categoryId = newCategory(owner, `Proof: ${label}`);
    const itemIds = insertEntries({
      session: owner,
      categoryId,
      count: ENTRIES,
      fields: (n) => ({
        title: `${NOUNS[n % NOUNS.length]} ${n}`,
        description: `Probe ${n}`,
        place: 'Trier',
        place_lat: 49.75,
        place_lng: 6.64,
        tags: ['antik'],
      }),
    });
    attachPhotos({
      session: owner,
      itemIds: PHOTO_EVERY
        ? itemIds.filter((_, n) => n % PHOTO_EVERY === 0)
        : [],
      photosEach: 1,
      bytes: encoding.b64decode(TINY_WEBP_BASE64, 'std'),
    });
    return { owner, categoryId };
  });
}
