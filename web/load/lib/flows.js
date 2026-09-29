// One iteration of each journey a collector takes, in the order the app sends its requests.
import { sleep } from 'k6';

import {
  createImageRow,
  createItemInCategory,
  exportPage,
  listPlaces,
  readPage,
  searchPage,
  signUrls,
  signUrlsRequest,
  signedUrlsOf,
  uploadObject,
} from './api.js';
import {
  EXPORT_SIGNED_URL_TTL_SECONDS,
  PHOTO_DOWNLOAD_CONCURRENCY,
  SIGN_BATCH_SIZE,
  SIGN_CONCURRENCY,
} from './clientLimits.js';
import { sendAll } from './http.js';
import { TINY_WEBP, photoPaths } from './photos.js';
import { SEARCH_TERMS } from './seed.js';

// A reader's pause between screens; without it every VU is a tight loop no person produces.
const THINK_SECONDS = 1;

// components/ItemList/imageEntries.ts RENDERABLE_PLATES: a card signs full size and thumbnail of its first five photographs.
export const RENDERABLE_PLATES = 5;

function pick(values) {
  return values[Math.floor(Math.random() * values.length)];
}

function slices(values, size) {
  const result = [];
  for (let start = 0; start < values.length; start += size)
    result.push(values.slice(start, start + size));
  return result;
}

export function platePaths(images) {
  return images.slice(0, RENDERABLE_PLATES).flatMap(photoPaths);
}

/** imageEntries.ts signEntries: one call for the page's cards, none for a page without photographs. */
function signCards(session, items) {
  const paths = items.flatMap((item) => platePaths(item.images));
  if (paths.length) signUrls({ session, paths });
}

/** A page as the app opens it: ids and count side by side, then the entries, then their photographs signed. */
function viewPage({ session, categoryId, page, name }) {
  const shown = readPage({ session, categoryId, page, name });
  signCards(session, shown.items);
  return shown;
}

/** Open the category, page forward twice, jump to the last page, then open the map. */
export function browse(session, categoryId) {
  const { lastPage } = viewPage({ session, categoryId, page: 1 });
  sleep(THINK_SECONDS);
  viewPage({ session, categoryId, page: 2 });
  sleep(THINK_SECONDS);
  viewPage({ session, categoryId, page: 3 });
  sleep(THINK_SECONDS);
  // The pagination's last-page button: the deepest offset one click reaches.
  viewPage({
    session,
    categoryId,
    page: lastPage,
    name: 'catalogue last page',
  });
  sleep(THINK_SECONDS);
  listPlaces({ session, categoryId });
  sleep(THINK_SECONDS);
}

/** Type a term, read two pages of matches with their photographs, then see them on the map. */
export function search({ session, categoryId, terms = SEARCH_TERMS }) {
  const term = pick(terms);
  for (const page of [1, 2]) {
    const found = searchPage({ session, categoryId, term, page });
    // Each row carries its photographs, so signing follows the RPC directly.
    signCards(session, found.status === 200 ? found.json() : []);
    sleep(THINK_SECONDS);
  }
  listPlaces({ session, categoryId, term });
  sleep(THINK_SECONDS);
}

/** data/exportCategory.ts: every page with its photographs, then the photographs signed and downloaded, six at a time. */
export function exportArchive(session, categoryId) {
  const paths = [];
  let after = null;
  do {
    const page = exportPage({ session, categoryId, after });
    paths.push(...page.paths);
    after = page.next;
  } while (after);

  const urls = slices(slices(paths, SIGN_BATCH_SIZE), SIGN_CONCURRENCY)
    .flatMap((batches) =>
      sendAll(
        batches.map((batch) =>
          signUrlsRequest({
            session,
            paths: batch,
            expiresIn: EXPORT_SIGNED_URL_TTL_SECONDS,
            name: 'export sign',
          }),
        ),
      ),
    )
    .flatMap(signedUrlsOf);
  for (const downloads of slices(urls, PHOTO_DOWNLOAD_CONCURRENCY)) {
    sendAll(downloads.map((url) => ({ url, name: 'export photo' })));
  }
  sleep(THINK_SECONDS);
}

/** Catalogue a new entry and attach a photograph, full size and thumbnail. */
export function write(session, categoryId) {
  // The app lets the database pick the id; the flow picks its own, to upload under it.
  const itemId = crypto.randomUUID();
  const created = createItemInCategory({
    session,
    categoryId,
    fields: {
      id: itemId,
      title: `Neuzugang ${itemId.slice(0, 8)}`,
      description: 'Catalogued under load',
      place: pick(['Rom', 'Wien', 'Prag']),
      tags: ['last'],
    },
  });
  if (created.status >= 300) return;

  const base = `${session.userId}/${itemId}/${crypto.randomUUID()}`;
  uploadObject({ session, path: `${base}.webp`, bytes: TINY_WEBP });
  uploadObject({ session, path: `${base}.thumb.webp`, bytes: TINY_WEBP });
  createImageRow(session, {
    item_id: itemId,
    path_full: `${base}.webp`,
    path_thumb: `${base}.thumb.webp`,
    size_bytes: TINY_WEBP.byteLength,
  });
  sleep(THINK_SECONDS);
}
