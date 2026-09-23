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

// Below a few thousand rows every plan is a sequential scan and the numbers say nothing (#662).
export const SEARCHED_ITEMS = PROFILE.searchedItems;
export const SHARED_ITEMS = PROFILE.sharedItems;
// One INSERT per request, set-based, at a body size no proxy in front of PostgREST refuses.
const SEED_BATCH = 10000;

export const NOUNS = ['Denar', 'Sesterz', 'Taler', 'Groschen', 'Dukat', 'Obol'];
const PLACES = ['Rom', 'Wien', 'Prag', 'Athen', 'Trier', 'Köln'];
const COORDS = {
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

/** `count` items newest-first, a minute apart, with the links that file them into one category; nine in ten carry their place's coordinates, as a picked suggestion does. */
function itemRows(count, categoryId, now, nouns) {
  const items = [];
  const links = [];
  for (let n = 0; n < count; n++) {
    const id = crypto.randomUUID();
    const createdAt = new Date(now - n * 60000).toISOString();
    const place = PLACES[n % PLACES.length];
    const [lat, lng] = n % 10 === 9 ? [null, null] : COORDS[place];
    items.push({
      id,
      title: `${nouns[n % nouns.length]} ${n}`,
      description: `Probe ${n} aus ${place}`,
      place,
      place_lat: lat,
      place_lng: lng,
      tags: [TAGS[n % TAGS.length], TAGS[(n + 2) % TAGS.length]],
      created_at: createdAt,
    });
    links.push({ item_id: id, category_id: categoryId, created_at: createdAt });
  }
  return { items, links };
}

/** Titles cycle through `nouns`, so one collector's word can be made rare in their own collection and common in everyone else's. */
export function fillCategory(session, categoryId, count, nouns = NOUNS) {
  const { items, links } = itemRows(count, categoryId, Date.now(), nouns);
  for (let i = 0; i < count; i += SEED_BATCH) {
    insertRows(session, 'items', items.slice(i, i + SEED_BATCH));
    insertRows(session, 'item_categories', links.slice(i, i + SEED_BATCH));
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

  const categories = insertReturning(
    owner,
    'categories',
    [{ name: 'Load: searched' }, { name: 'Load: shared' }],
    'id,name',
  );
  const idOf = (name) => categories.find((c) => c.name === name).id;
  const searchedCategoryId = idOf('Load: searched');
  const sharedCategoryId = idOf('Load: shared');

  fillCategory(owner, searchedCategoryId, SEARCHED_ITEMS);
  fillCategory(owner, sharedCategoryId, SHARED_ITEMS);
  insertRows(owner, 'category_shares', [
    {
      category_id: sharedCategoryId,
      invited_email: viewer.email,
      role: 'viewer',
    },
  ]);

  const [written] = insertReturning(
    writer,
    'categories',
    [{ name: 'Load: written' }],
    'id',
  );

  return {
    owner,
    viewer,
    writer,
    searchedCategoryId,
    sharedCategoryId,
    writtenCategoryId: written.id,
  };
}

// Storage objects before rows, never after (CLAUDE.md); items cascade their photographs and links, categories their shares.
export function clearAccount(session) {
  for (let offset = 0; ; offset += PHOTO_PAGE) {
    const rows = listImagePaths(session, offset, PHOTO_PAGE);
    if (rows.length === 0) break;
    removeObjects(
      session,
      rows.flatMap((row) =>
        row.path_thumb ? [row.path_full, row.path_thumb] : [row.path_full],
      ),
    );
  }
  deleteOwnRows(session, 'items');
  deleteOwnRows(session, 'categories');
}

export function teardown({ owner, writer }) {
  clearAccount(owner);
  clearAccount(writer);
}
