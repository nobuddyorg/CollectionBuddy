// Every script's setup() and teardown(): three fresh identities and a production-shaped collection, all written through RLS.
import {
  SEED_BATCH,
  deleteOwnRows,
  entrySliceEnd,
  insertReturning,
  insertRows,
  listImagePaths,
  removeObjects,
  signUp,
} from './api.js';
import { attachPhotos, photoPaths } from './photos.js';
import { PROFILE } from './profile.js';

// Below a few thousand rows every plan is a sequential scan and the numbers say nothing.
export const SEARCHED_ITEMS = PROFILE.searchedItems;
export const SHARED_ITEMS = PROFILE.sharedItems;

export const NOUNS = ['Denar', 'Sesterz', 'Taler', 'Groschen', 'Dukat', 'Obol'];
const PLACES = ['Rom', 'Wien', 'Prag', 'Athen', 'Trier', 'Köln'];
const COORDINATES = {
  Rom: [41.9, 12.5],
  Wien: [48.21, 16.37],
  Prag: [50.08, 14.43],
  Athen: [37.98, 23.73],
  Trier: [49.75, 6.64],
  Köln: [50.94, 6.96],
};
// More places than one page of the map (data/postgrestLimits.ts POSTGREST_MAX_ROWS), so the map pages as a large collection's does.
const PLACE_COUNT = 1200;
// Most descriptions a line, some a paragraph, a few a page: wide rows are what spill a search's sort to disk.
const DESCRIPTION_REPEATS = [0, 1, 4, 30];
const DESCRIPTION_FILLER =
  ' Gut erhalten, Randprägung sichtbar, Herkunft belegt.';
// Every tenth entry photographed, so pages carry the images embed and a sign call, and Storage holds objects to check.
const PHOTO_EVERY = 10;
const TAGS = ['silber', 'bronze', 'gold', 'antik', 'mittelalter'];
// Terms the search flows pick from: common, rare, and one that matches nothing.
export const SEARCH_TERMS = ['Denar', 'Wien', 'silber', 'Dukat 42', 'zzqx'];

// Two paths per row, so one page stays within Storage's 1,000 prefixes per delete.
const PHOTO_PAGE = 500;
// Entries deleted per statement; one category cascade unfiling 40,000 ran 70 s, past the 8 s statement timeout.
const ENTRY_SLICE = 1000;

/** `n`'s place: a city and one of its districts, each district a point of its own; nine in ten carry coordinates. */
function placeOf(n) {
  const slot = n % PLACE_COUNT;
  const city = PLACES[slot % PLACES.length];
  const district = Math.floor(slot / PLACES.length);
  const [latitude, longitude] = COORDINATES[city];
  const located = n % 10 !== 9;
  return {
    place: `${city} ${district + 1}`,
    place_lat: located ? latitude + district * 0.001 : null,
    place_lng: located ? longitude + district * 0.001 : null,
  };
}

/** `count` entries newest-first, a minute apart, filed into one category; `fields(n)` supplies each entry's own columns. */
export function insertEntries({ session, categoryId, count, fields }) {
  const now = Date.now();
  const ids = [];
  for (let start = 0; start < count; start += SEED_BATCH) {
    const items = [];
    const links = [];
    for (let n = start; n < Math.min(count, start + SEED_BATCH); n++) {
      const id = crypto.randomUUID();
      const createdAt = new Date(now - n * 60000).toISOString();
      items.push({ id, created_at: createdAt, ...fields(n) });
      links.push({
        item_id: id,
        category_id: categoryId,
        created_at: createdAt,
      });
      ids.push(id);
    }
    insertRows({ session, table: 'items', rows: items });
    insertRows({ session, table: 'item_categories', rows: links });
  }
  return ids;
}

/** Titles cycle through `nouns`, so one collector's word can be rare in their own collection and common elsewhere. */
export function fillCategory({ session, categoryId, count, nouns = NOUNS }) {
  const itemIds = insertEntries({
    session,
    categoryId,
    count,
    fields: (n) => {
      const where = placeOf(n);
      return {
        title: `${nouns[n % nouns.length]} ${n}`,
        description: `Probe ${n} aus ${where.place}.${DESCRIPTION_FILLER.repeat(DESCRIPTION_REPEATS[n % DESCRIPTION_REPEATS.length])}`,
        ...where,
        tags: [TAGS[n % TAGS.length], TAGS[(n + 2) % TAGS.length]],
      };
    },
  });
  attachPhotos({
    session,
    itemIds: itemIds.filter((_, n) => n % PHOTO_EVERY === 0),
    photosEach: 1,
  });
}

export function newIdentity(label) {
  const run = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  return signUp(`${label}-${run}@collectionbuddy.test`, crypto.randomUUID());
}

export function setup() {
  const owner = newIdentity('load-owner');
  const viewer = newIdentity('load-viewer');
  // Writes land in their own account, so a stress run's new entries never meet the seeded owner's quota.
  const writer = newIdentity('load-writer');

  const categories = insertReturning({
    session: owner,
    table: 'categories',
    rows: [{ name: 'Load: searched' }, { name: 'Load: shared' }],
    select: 'id,name',
  });
  const idOf = (name) =>
    categories.find((category) => category.name === name).id;
  const searchedCategoryId = idOf('Load: searched');
  const sharedCategoryId = idOf('Load: shared');

  fillCategory({
    session: owner,
    categoryId: searchedCategoryId,
    count: SEARCHED_ITEMS,
  });
  fillCategory({
    session: owner,
    categoryId: sharedCategoryId,
    count: SHARED_ITEMS,
  });
  insertRows({
    session: owner,
    table: 'category_shares',
    rows: [
      {
        category_id: sharedCategoryId,
        invited_email: viewer.email,
        role: 'viewer',
      },
    ],
  });

  const [written] = insertReturning({
    session: writer,
    table: 'categories',
    rows: [{ name: 'Load: written' }],
    select: 'id',
  });

  return {
    owner,
    viewer,
    writer,
    searchedCategoryId,
    sharedCategoryId,
    writtenCategoryId: written.id,
  };
}

// Storage objects before rows, never after; big accounts' entries go a slice at a time, then categories, whose cascade drops the rest set-based.
export function clearAccount(session) {
  for (let offset = 0; ; offset += PHOTO_PAGE) {
    const rows = listImagePaths({ session, offset, limit: PHOTO_PAGE });
    if (rows.length === 0) break;
    removeObjects(session, rows.flatMap(photoPaths));
  }
  for (
    let last = entrySliceEnd(session, ENTRY_SLICE);
    last;
    last = entrySliceEnd(session, ENTRY_SLICE)
  ) {
    deleteOwnRows({ session, table: 'items', filters: { id: `lte.${last}` } });
  }
  deleteOwnRows({ session, table: 'categories' });
  deleteOwnRows({ session, table: 'items' });
}

export function teardown({ owner, writer }) {
  clearAccount(owner);
  clearAccount(writer);
}
