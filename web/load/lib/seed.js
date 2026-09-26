// Every script's setup() and teardown(): three fresh identities and a production-shaped collection, all written through RLS.
import {
  deleteOwnRows,
  insertReturning,
  insertRows,
  listImagePaths,
  removeObjects,
  signUp,
} from './api.js';
import { PROFILE } from './profile.js';

// Below a few thousand rows every plan is a sequential scan and the numbers say nothing.
export const SEARCHED_ITEMS = PROFILE.searchedItems;
export const SHARED_ITEMS = PROFILE.sharedItems;
// One INSERT per request, set-based, at a body size no proxy in front of PostgREST refuses.
const SEED_BATCH = 10000;

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
const TAGS = ['silber', 'bronze', 'gold', 'antik', 'mittelalter'];
// Terms the search flows pick from: common, rare, and one that matches nothing.
export const SEARCH_TERMS = ['Denar', 'Wien', 'silber', 'Dukat 42', 'zzqx'];

// Two paths per row, so one page stays within Storage's 1,000 prefixes per delete.
const PHOTO_PAGE = 500;

/** `count` items newest-first, a minute apart, filed into one category; nine in ten carry their place's coordinates. */
function itemRows({ count, categoryId, now, nouns }) {
  const items = [];
  const links = [];
  for (let n = 0; n < count; n++) {
    const id = crypto.randomUUID();
    const createdAt = new Date(now - n * 60000).toISOString();
    const place = PLACES[n % PLACES.length];
    const [latitude, longitude] =
      n % 10 === 9 ? [null, null] : COORDINATES[place];
    items.push({
      id,
      title: `${nouns[n % nouns.length]} ${n}`,
      description: `Probe ${n} aus ${place}`,
      place,
      place_lat: latitude,
      place_lng: longitude,
      tags: [TAGS[n % TAGS.length], TAGS[(n + 2) % TAGS.length]],
      created_at: createdAt,
    });
    links.push({ item_id: id, category_id: categoryId, created_at: createdAt });
  }
  return { items, links };
}

/** Titles cycle through `nouns`, so one collector's word can be rare in their own collection and common elsewhere. */
export function fillCategory({ session, categoryId, count, nouns = NOUNS }) {
  const { items, links } = itemRows({
    count,
    categoryId,
    now: Date.now(),
    nouns,
  });
  for (let i = 0; i < count; i += SEED_BATCH) {
    insertRows({
      session,
      table: 'items',
      rows: items.slice(i, i + SEED_BATCH),
    });
    insertRows({
      session,
      table: 'item_categories',
      rows: links.slice(i, i + SEED_BATCH),
    });
  }
}

export function setup() {
  const run = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const owner = signUp(
    `load-owner-${run}@collectionbuddy.test`,
    crypto.randomUUID(),
  );
  const viewer = signUp(
    `load-viewer-${run}@collectionbuddy.test`,
    crypto.randomUUID(),
  );
  // Writes land in their own account, so a stress run's new entries never meet the seeded owner's quota.
  const writer = signUp(
    `load-writer-${run}@collectionbuddy.test`,
    crypto.randomUUID(),
  );

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

// Storage objects before rows, never after; categories go first, as their cascade drops filed items set-based, not per-row checked.
export function clearAccount(session) {
  for (let offset = 0; ; offset += PHOTO_PAGE) {
    const rows = listImagePaths({ session, offset, limit: PHOTO_PAGE });
    if (rows.length === 0) break;
    removeObjects(
      session,
      rows.flatMap((row) =>
        row.path_thumb ? [row.path_full, row.path_thumb] : [row.path_full],
      ),
    );
  }
  deleteOwnRows(session, 'categories');
  deleteOwnRows(session, 'items');
}

export function teardown({ owner, writer }) {
  clearAccount(owner);
  clearAccount(writer);
}
