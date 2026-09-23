// One iteration of each journey a collector takes, in the order the app sends its requests.
import { sleep } from 'k6';
import encoding from 'k6/encoding';

import {
  countItems,
  createImageRow,
  createItem,
  linkItem,
  listPage,
  listPlaces,
  searchPage,
  uploadObject,
} from './api.js';
import { SEARCH_TERMS } from './seed.js';

// A reader's pause between screens; without it every VU is a tight loop no person produces.
const THINK_SECONDS = 1;
// A 1x1 WebP: the bucket accepts image/webp, and the bytes are not what is under test.
const PHOTO = encoding.b64decode(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA',
  'std',
);

function pick(values) {
  return values[Math.floor(Math.random() * values.length)];
}

/** Open the category, page forward twice, then open the map. */
export function browse(session, categoryId) {
  listPage(session, categoryId, 1);
  countItems(session, categoryId);
  sleep(THINK_SECONDS);
  listPage(session, categoryId, 2);
  sleep(THINK_SECONDS);
  listPage(session, categoryId, 3);
  sleep(THINK_SECONDS);
  listPlaces(session, categoryId);
  sleep(THINK_SECONDS);
}

/** Type a term, read two pages of matches, then see them on the map. */
export function search(session, categoryId) {
  const term = pick(SEARCH_TERMS);
  searchPage(session, categoryId, term, 1);
  sleep(THINK_SECONDS);
  searchPage(session, categoryId, term, 2);
  sleep(THINK_SECONDS);
  listPlaces(session, categoryId, term);
  sleep(THINK_SECONDS);
}

/** Catalogue a new entry and attach a photograph, full size and thumbnail. */
export function write(session, categoryId) {
  const itemId = createItem(session, {
    title: `Neuzugang ${crypto.randomUUID().slice(0, 8)}`,
    description: 'Catalogued under load',
    place: pick(['Rom', 'Wien', 'Prag']),
    tags: ['last'],
  });
  if (!itemId) return;
  linkItem(session, itemId, categoryId);

  const base = `${session.userId}/${itemId}/${crypto.randomUUID()}`;
  uploadObject(session, `${base}.webp`, PHOTO);
  uploadObject(session, `${base}.thumb.webp`, PHOTO);
  createImageRow(session, {
    item_id: itemId,
    path_full: `${base}.webp`,
    path_thumb: `${base}.thumb.webp`,
    size_bytes: PHOTO.byteLength,
  });
  sleep(THINK_SECONDS);
}
