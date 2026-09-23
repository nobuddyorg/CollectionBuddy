// Every script's setup() and teardown(): two fresh identities and a production-shaped collection, all written through RLS.
import {
  deleteOwnRows,
  insertReturning,
  insertRows,
  listImagePaths,
  removeObjects,
  signUp,
} from './api.js';

// Below a few thousand rows every plan is a sequential scan and the numbers say nothing (#662).
export const SEARCHED_ITEMS = 10000;
export const SHARED_ITEMS = 300;

const NOUNS = ['Denar', 'Sesterz', 'Taler', 'Groschen', 'Dukat', 'Obol'];
const PLACES = ['Rom', 'Wien', 'Prag', 'Athen', 'Trier', 'Köln'];
const TAGS = ['silber', 'bronze', 'gold', 'antik', 'mittelalter'];
// Terms the search flows pick from: common, rare, and one that matches nothing.
export const SEARCH_TERMS = ['Denar', 'Wien', 'silber', 'Dukat 42', 'zzqx'];

// Two paths per row, so one page stays within Storage's 1,000 prefixes per delete.
const PHOTO_PAGE = 500;

/** `count` items newest-first, a minute apart, with the links that file them into one category. */
function itemRows(count, categoryId, now) {
  const items = [];
  const links = [];
  for (let n = 0; n < count; n++) {
    const id = crypto.randomUUID();
    const createdAt = new Date(now - n * 60000).toISOString();
    const place = PLACES[n % PLACES.length];
    items.push({
      id,
      title: `${NOUNS[n % NOUNS.length]} ${n}`,
      description: `Probe ${n} aus ${place}`,
      place,
      tags: [TAGS[n % TAGS.length], TAGS[(n + 2) % TAGS.length]],
      created_at: createdAt,
    });
    links.push({ item_id: id, category_id: categoryId, created_at: createdAt });
  }
  return { items, links };
}

function fillCategory(session, categoryId, count) {
  const { items, links } = itemRows(count, categoryId, Date.now());
  insertRows(session, 'items', items);
  insertRows(session, 'item_categories', links);
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

  const categories = insertReturning(
    owner,
    'categories',
    [
      { name: 'Load: searched' },
      { name: 'Load: shared' },
      { name: 'Load: written' },
    ],
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

  return {
    owner,
    viewer,
    searchedCategoryId,
    sharedCategoryId,
    writtenCategoryId: idOf('Load: written'),
  };
}

// Storage objects before rows, never after (CLAUDE.md); items cascade their photographs and links, categories their shares.
export function teardown({ owner }) {
  for (let offset = 0; ; offset += PHOTO_PAGE) {
    const rows = listImagePaths(owner, offset, PHOTO_PAGE);
    if (rows.length === 0) break;
    removeObjects(
      owner,
      rows.flatMap((row) =>
        row.path_thumb ? [row.path_full, row.path_thumb] : [row.path_full],
      ),
    );
  }
  deleteOwnRows(owner, 'items');
  deleteOwnRows(owner, 'categories');
}
