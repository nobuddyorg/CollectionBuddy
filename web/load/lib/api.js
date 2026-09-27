// The requests web/src/app/data/*.ts sends through supabase-js, spelled out as HTTP; keep the two in step.
import { expectOk, query, send, sendAll, sendJson } from './http.js';
import { SUPABASE_URL } from './target.js';

export { query } from './http.js';

const BUCKET = 'item-images';
const ITEM_FIELDS = 'id,title,description,place,place_lat,place_lng,tags';
// data/itemPage.ts ITEM_WITH_IMAGES_SELECT.
const ITEM_WITH_IMAGES_SELECT = `${ITEM_FIELDS},images(id,item_id,path_full,path_thumb)`;
// components/ItemList/paging.ts PAGE_SIZE.
const PAGE_SIZE = 9;
// data/items.ts PLACE_PAGE_SIZE.
const PLACE_PAGE_SIZE = 1000;
// data/exportCategory.ts ITEM_PAGE_SIZE.
const EXPORT_PAGE_SIZE = 500;

// Local stacks confirm email sign-ups instantly; the hosted project has no password sign-in to call.
export function signUp(email, password) {
  const response = expectOk(
    sendJson({
      method: 'POST',
      path: '/auth/v1/signup',
      payload: { email, password },
      name: 'auth signup',
    }),
    `signing up ${email}`,
  );
  const { access_token: token, user } = response.json();
  if (!token) throw new Error(`signing up ${email} returned no session`);
  return { token, userId: user.id, email };
}

function pageIdsRequest({ session, categoryId, page, name }) {
  const params = query({
    select: 'item_id',
    category_id: `eq.${categoryId}`,
    order: 'created_at.desc,item_id.asc',
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  });
  return {
    method: 'GET',
    path: `/rest/v1/item_categories?${params}`,
    session,
    name,
  };
}

function countRequest(session, categoryId) {
  const params = query({
    select: 'item_id',
    category_id: `eq.${categoryId}`,
  });
  return {
    method: 'HEAD',
    path: `/rest/v1/item_categories?${params}`,
    session,
    headers: { Prefer: 'count=exact' },
    name: 'catalogue count',
  };
}

/** The entries behind a page of ids, with their photographs, in page order. */
function pageItems(session, idPage) {
  // A refused request already fails its check; an empty page keeps the flow going.
  const ids =
    idPage.status === 200 ? idPage.json().map((link) => link.item_id) : [];
  if (ids.length === 0)
    return { items: [], durationMs: idPage.timings.duration };

  const itemParams = query({
    select: ITEM_WITH_IMAGES_SELECT,
    id: `in.(${ids.join(',')})`,
    'images.order': 'created_at.asc,id.asc',
  });
  const itemPage = send({
    method: 'GET',
    path: `/rest/v1/items?${itemParams}`,
    session,
    name: 'catalogue page items',
  });
  const rows = itemPage.status === 200 ? itemPage.json() : [];
  const byId = new Map(rows.map((item) => [item.id, item]));
  return {
    items: ids.flatMap((id) => byId.get(id) ?? []),
    durationMs: idPage.timings.duration + itemPage.timings.duration,
  };
}

/** The page's ids, then its entries with their photographs; no count. */
export function listPage({ session, categoryId, page }) {
  return pageItems(
    session,
    send(
      pageIdsRequest({ session, categoryId, page, name: 'catalogue page ids' }),
    ),
  );
}

/** data/itemPage.ts listItems, unfiltered, as the app sends it: ids and exact total side by side, then the entries; `name` tags the ids read. */
export function readPage({
  session,
  categoryId,
  page,
  name = 'catalogue page ids',
}) {
  const [idPage, counted] = sendAll([
    pageIdsRequest({ session, categoryId, page, name }),
    countRequest(session, categoryId),
  ]);
  // PostgREST answers a counted HEAD with `Content-Range: */<total>`.
  const total = Number((counted.headers['Content-Range'] ?? '').split('/')[1]);
  return {
    ...pageItems(session, idPage),
    lastPage: Math.max(1, Math.ceil((total || 0) / PAGE_SIZE)),
  };
}

/** data/itemPage.ts rawCountItems, unfiltered: the exact total, as a HEAD. */
export function countItems(session, categoryId) {
  return send(countRequest(session, categoryId));
}

/** data/itemPage.ts rawSearchCategoryItems: a searched page and its total. */
export function searchPage({ session, categoryId, term, page }) {
  const params = query({
    cat_id: categoryId,
    like_pattern: `%${term}%`,
    page_from: (page - 1) * PAGE_SIZE,
    page_to: page * PAGE_SIZE - 1,
  });
  return send({
    method: 'GET',
    path: `/rest/v1/rpc/search_category_items?${params}`,
    session,
    name: 'search page',
  });
}

/** data/items.ts listCategoryPlaces: the map's places, narrowed like the list, page by page until a short one. */
export function listPlaces({ session, categoryId, term }) {
  for (let offset = 0; ; offset += PLACE_PAGE_SIZE) {
    const page = { offset, limit: PLACE_PAGE_SIZE };
    const params = query(
      term
        ? { cat_id: categoryId, like_pattern: `%${term}%`, ...page }
        : { cat_id: categoryId, ...page },
    );
    const response = send({
      method: 'GET',
      path: `/rest/v1/rpc/list_category_places?${params}`,
      session,
      name: 'map places',
    });
    const rows = response.status === 200 ? response.json() : [];
    if (rows.length < PLACE_PAGE_SIZE) return;
  }
}

/** data/images.ts createSignedUrls: one request for every path; Storage checks each object against its select policy. */
export function signUrlsRequest({
  session,
  paths,
  expiresIn = 3600,
  name = 'sign urls',
}) {
  return {
    method: 'POST',
    path: `/storage/v1/object/sign/${BUCKET}`,
    session,
    body: JSON.stringify({ expiresIn, paths }),
    headers: { 'Content-Type': 'application/json' },
    name,
  };
}

export function signUrls(request) {
  return send(signUrlsRequest(request));
}

/** Storage answers a sign call with URLs relative to its own root, as supabase-js resolves them. */
export function signedUrlsOf(response) {
  if (response.status !== 200) return [];
  return response
    .json()
    .filter((signature) => signature.signedURL)
    .map((signature) => `${SUPABASE_URL}/storage/v1${signature.signedURL}`);
}

/** data/exportItemPages.ts rawListItemsForExport: one keyset page of links, each entry with its full-size photographs. */
export function exportPage({ session, categoryId, after }) {
  const params = {
    select: `created_at,item_id,items!inner(${ITEM_FIELDS},created_at,images(item_id,path_full,size_bytes))`,
    category_id: `eq.${categoryId}`,
    order: 'created_at.asc,item_id.asc',
    'items.images.order': 'created_at.asc,id.asc',
    limit: EXPORT_PAGE_SIZE,
  };
  if (after) {
    // data/keyset.ts rowsAfterFilter.
    const linkedAt = `"${after.created_at}"`;
    params.created_at = `gte.${after.created_at}`;
    params.or = `(created_at.gt.${linkedAt},and(created_at.eq.${linkedAt},item_id.gt."${after.item_id}"))`;
  }
  const response = send({
    method: 'GET',
    path: `/rest/v1/item_categories?${query(params)}`,
    session,
    name: 'export page',
  });
  const rows = response.status === 200 ? response.json() : [];
  return {
    paths: rows.flatMap((row) =>
      row.items.images.map((image) => image.path_full),
    ),
    next: rows.length === EXPORT_PAGE_SIZE ? rows[rows.length - 1] : null,
  };
}

/** data/items.ts createItemsInCategory: the entry and its link in one transaction; user_id is the trigger's to fill in. */
export function createItemInCategory({ session, categoryId, fields }) {
  return sendJson({
    method: 'POST',
    path: '/rest/v1/rpc/create_items_in_category',
    session,
    payload: { target_category_id: categoryId, entries: [fields] },
    name: 'create item',
  });
}

/** data/images.ts uploadImageObject: never an upsert, a path is written once. */
export function uploadObject({ session, path, bytes }) {
  return send({
    method: 'POST',
    path: `/storage/v1/object/${BUCKET}/${path}`,
    session,
    body: bytes,
    headers: { 'Content-Type': 'image/webp' },
    name: 'upload photo',
  });
}

export function createImageRow(session, row) {
  return sendJson({
    method: 'POST',
    path: '/rest/v1/images',
    session,
    payload: row,
    name: 'create image row',
  });
}

/** Bulk writes for setup: one request, so one INSERT statement, per call. */
export function insertRows({ session, table, rows }) {
  return expectOk(
    sendJson({
      method: 'POST',
      path: `/rest/v1/${table}`,
      session,
      payload: rows,
      name: `seed ${table}`,
    }),
    `inserting ${rows.length} ${table} rows`,
  );
}

export function insertReturning({ session, table, rows, select }) {
  return expectOk(
    sendJson({
      method: 'POST',
      path: `/rest/v1/${table}?${query({ select })}`,
      session,
      payload: rows,
      prefer: 'return=representation',
      name: `seed ${table}`,
    }),
    `inserting ${table}`,
  ).json();
}

/** One page of the caller's photograph paths, for teardown's Storage-first delete. */
export function listImagePaths({ session, offset, limit }) {
  const params = query({
    select: 'path_full,path_thumb',
    user_id: `eq.${session.userId}`,
    order: 'id',
    offset,
    limit,
  });
  return expectOk(
    send({
      method: 'GET',
      path: `/rest/v1/images?${params}`,
      session,
      name: 'teardown images',
    }),
    'listing photographs',
  ).json();
}

export function removeObjects(session, paths) {
  return expectOk(
    sendJson({
      method: 'DELETE',
      path: `/storage/v1/object/${BUCKET}`,
      session,
      payload: { prefixes: paths },
      name: 'teardown storage',
    }),
    `removing ${paths.length} objects`,
  );
}

/** The id that closes the caller's first `size` entries in id order, or null when fewer are left. */
export function entrySliceEnd(session, size) {
  const params = query({
    select: 'id',
    user_id: `eq.${session.userId}`,
    order: 'id',
    offset: size - 1,
    limit: 1,
  });
  const [last] = expectOk(
    send({
      method: 'GET',
      path: `/rest/v1/items?${params}`,
      session,
      name: 'teardown items',
    }),
    'listing entries',
  ).json();
  return last ? last.id : null;
}

/** `filters` narrows the delete further, as PostgREST filter params (`{ id: 'lte.<uuid>' }`). */
export function deleteOwnRows(session, table, filters = {}) {
  const params = query({ user_id: `eq.${session.userId}`, ...filters });
  return expectOk(
    send({
      method: 'DELETE',
      path: `/rest/v1/${table}?${params}`,
      session,
      name: `teardown ${table}`,
    }),
    `deleting ${table}`,
  );
}
