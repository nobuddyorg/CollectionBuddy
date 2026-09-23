// The requests web/src/app/data/*.ts sends through supabase-js, spelled out as HTTP; keep the two in step.
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';

import { ANON_KEY, SUPABASE_URL } from './target.js';

// k6's error code for a request that ran into its own timeout (k6 docs, "Error codes").
const REQUEST_TIMEOUT = 1050;
const timeouts = new Counter('http_req_timeouts');

const BUCKET = 'item-images';
const ITEM_FIELDS = 'id,title,description,place,place_lat,place_lng,tags';
// data/items.ts ITEM_CATEGORY_PAGE_WITH_IMAGES_SELECT.
const PAGE_SELECT = `items!inner(${ITEM_FIELDS},images(id,item_id,path_full,path_thumb))`;
// components/ItemList/paging.ts PAGE_SIZE.
const PAGE_SIZE = 9;

function query(params) {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
}

function send({ method, path, session, body, headers = {}, name }) {
  const response = http.request(method, `${SUPABASE_URL}${path}`, body, {
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${session ? session.token : ANON_KEY}`,
      ...headers,
    },
    tags: { name },
  });
  if (response.error_code === REQUEST_TIMEOUT) timeouts.add(1, { name });
  check(response, {
    [`${name} succeeded`]: (checked) =>
      checked.status >= 200 && checked.status < 300,
  });
  return response;
}

function sendJson({ method, path, session, payload, prefer, name }) {
  return send({
    method,
    path,
    session,
    name,
    body: JSON.stringify(payload),
    headers: {
      'Content-Type': 'application/json',
      Prefer: prefer ?? 'return=minimal',
    },
  });
}

/** Throws with the response body, for setup and teardown steps a run cannot continue without. */
function expectOk(response, what) {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${what} failed: HTTP ${response.status} ${response.body}`);
  }
  return response;
}

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

/** data/items.ts rawListItems, unfiltered: one catalogue page with its photographs. */
export function listPage({ session, categoryId, page }) {
  const params = query({
    select: PAGE_SELECT,
    category_id: `eq.${categoryId}`,
    order: 'created_at.desc,item_id.asc',
    'items.images.order': 'created_at.asc,id.asc',
    offset: (page - 1) * PAGE_SIZE,
    limit: PAGE_SIZE,
  });
  return send({
    method: 'GET',
    path: `/rest/v1/item_categories?${params}`,
    session,
    name: 'catalogue page',
  });
}

/** data/items.ts rawCountItems, unfiltered: the exact total, as a HEAD. */
export function countItems(session, categoryId) {
  const params = query({
    select: 'item_id',
    category_id: `eq.${categoryId}`,
  });
  return send({
    method: 'HEAD',
    path: `/rest/v1/item_categories?${params}`,
    session,
    headers: { Prefer: 'count=exact' },
    name: 'catalogue count',
  });
}

/** data/items.ts rawSearchCategoryItems: a searched page and its total. */
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

/** data/items.ts rawListCategoryPlaces: the map's places, narrowed like the list. */
export function listPlaces({ session, categoryId, term }) {
  const params = query(
    term
      ? { cat_id: categoryId, like_pattern: `%${term}%` }
      : { cat_id: categoryId },
  );
  return send({
    method: 'GET',
    path: `/rest/v1/rpc/list_category_places?${params}`,
    session,
    name: 'map places',
  });
}

/** data/items.ts createItem; user_id is the trigger's to fill in. */
export function createItem(session, fields) {
  const response = sendJson({
    method: 'POST',
    path: '/rest/v1/items?select=id',
    session,
    payload: fields,
    prefer: 'return=representation',
    name: 'create item',
  });
  return response.status === 201 ? response.json()[0].id : null;
}

export function linkItem({ session, itemId, categoryId }) {
  return sendJson({
    method: 'POST',
    path: '/rest/v1/item_categories',
    session,
    payload: { item_id: itemId, category_id: categoryId },
    name: 'link item',
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

export function deleteOwnRows(session, table) {
  return expectOk(
    send({
      method: 'DELETE',
      path: `/rest/v1/${table}?user_id=eq.${session.userId}`,
      session,
      name: `teardown ${table}`,
    }),
    `deleting ${table}`,
  );
}
