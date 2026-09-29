// #780's client mirrors: export's keyset item pages and sign batches, and category delete's metadata reads.
import http from 'k6/http';

import { ITEM_FIELDS, query } from '../../lib/api.js';
import {
  CHUNK_READ_CONCURRENCY,
  EXPORT_ITEM_PAGE_SIZE,
  EXPORT_SIGNED_URL_TTL_SECONDS,
  ID_FILTER_CHUNK_SIZE,
  POSTGREST_MAX_ROWS,
  SIGN_BATCH_SIZE,
  SIGN_CONCURRENCY,
} from '../../lib/clientLimits.js';
import { authHeaders, expectOk } from '../../lib/http.js';
import { SUPABASE_URL } from '../../lib/target.js';
import { BUCKET, call, inList, probeMs } from './fixtures.js';

// The suggested fix's read, which the budget is taken from.
export const EMBEDDED_INNER = `${ITEM_FIELDS},created_at,images(path_full,size_bytes)`;

function authorized({ session, probe, headers = {} }) {
  return {
    headers: { ...authHeaders(session), ...headers },
    tags: { name: probe, probe },
  };
}

/** exportItemPages.ts rawListItemsForExport, keyset-paged, each item with its photographs oldest-first. */
export function exportPages({ session, categoryId, inner, probe }) {
  const items = [];
  let requests = 0;
  let after = null;
  do {
    const params = {
      select: `created_at,item_id,items!inner(${inner})`,
      category_id: `eq.${categoryId}`,
      order: 'created_at.asc,item_id.asc',
      'items.images.order': 'created_at.asc,id.asc',
      limit: EXPORT_ITEM_PAGE_SIZE,
    };
    if (after) {
      const linkedAt = `"${after.created_at}"`;
      params.created_at = `gte.${after.created_at}`;
      params.or = `(created_at.gt.${linkedAt},and(created_at.eq.${linkedAt},item_id.gt."${after.item_id}"))`;
    }
    const rows = call({
      path: `/rest/v1/item_categories?${query(params)}`,
      session,
      probe,
    }).json();
    requests += 1;
    items.push(...rows.map((row) => row.items));
    after =
      rows.length === EXPORT_ITEM_PAGE_SIZE ? rows[rows.length - 1] : null;
  } while (after);
  return {
    paths: items.flatMap((item) => item.images.map((image) => image.path_full)),
    requests,
  };
}

/** readAllChunks over 100-id chunks, six at a time; each chunk here stays under one 1,000-row page, which is checked. */
function chunkedReads({ session, ids, probe, pathFor }) {
  const rows = [];
  let requests = 0;
  const idsPerBatch = ID_FILTER_CHUNK_SIZE * CHUNK_READ_CONCURRENCY;
  for (let start = 0; start < ids.length; start += idsPerBatch) {
    const batch = [];
    for (
      let chunk = start;
      chunk < Math.min(ids.length, start + idsPerBatch);
      chunk += ID_FILTER_CHUNK_SIZE
    ) {
      batch.push({
        method: 'GET',
        url: `${SUPABASE_URL}${pathFor(ids.slice(chunk, chunk + ID_FILTER_CHUNK_SIZE))}`,
        params: authorized({ session, probe }),
      });
    }
    for (const response of http.batch(batch)) {
      probeMs.add(response.timings.duration, { probe });
      const page = expectOk(response, probe).json();
      if (page.length >= POSTGREST_MAX_ROWS)
        throw new Error(
          `${probe}: a chunk filled a whole page; the mirror would need a second page`,
        );
      rows.push(...page);
    }
    requests += batch.length;
  }
  return { rows, requests };
}

/** categories.ts listItemIdsForCategory: 1,000-row pages until a short one. */
function listCategoryItemIds({ session, categoryId }) {
  const itemIds = [];
  let requests = 0;
  for (let offset = 0; ; offset += POSTGREST_MAX_ROWS) {
    const response = call({
      path: `/rest/v1/item_categories?${query({ select: 'item_id', category_id: `eq.${categoryId}`, offset, limit: POSTGREST_MAX_ROWS })}`,
      session,
      probe: 'delete_current',
    });
    const page = expectOk(response, 'delete_current').json();
    requests += 1;
    itemIds.push(...page.map((row) => row.item_id));
    if (page.length < POSTGREST_MAX_ROWS) return { itemIds, requests };
  }
}

/** images.ts listImagePathsForCategory: one keyset walk over the category's photographs; the client keeps the orphans' client-side. */
function countImagePathPages({ session, categoryId }) {
  let requests = 0;
  let after = null;
  for (;;) {
    const params = {
      select:
        'id,item_id,path_full,path_thumb,items!inner(item_categories!inner())',
      'items.item_categories.category_id': `eq.${categoryId}`,
      order: 'id.asc',
      limit: POSTGREST_MAX_ROWS,
    };
    if (after) params.id = `gt.${after}`;
    const response = call({
      path: `/rest/v1/images?${query(params)}`,
      session,
      probe: 'delete_current',
    });
    const page = expectOk(response, 'delete_current').json();
    requests += 1;
    if (page.length < POSTGREST_MAX_ROWS) return requests;
    after = page[page.length - 1].id;
  }
}

/** useCategories.tsx's delete, reads only: the category's item ids, which of them are linked elsewhere, then the category's photo paths. */
export function deleteMetadata({ session, categoryId }) {
  const { itemIds, requests } = listCategoryItemIds({ session, categoryId });
  const linked = chunkedReads({
    session,
    ids: itemIds,
    probe: 'delete_current',
    pathFor: (ids) =>
      `/rest/v1/item_categories?${query({ select: 'item_id', item_id: inList(ids), category_id: `neq.${categoryId}`, offset: 0, limit: POSTGREST_MAX_ROWS })}`,
  });
  return (
    requests + linked.requests + countImagePathPages({ session, categoryId })
  );
}

/** exportCategory.ts signAll: 100 paths per call, six calls at a time. */
export function signBatches({ session, paths, probe }) {
  const batches = [];
  for (let start = 0; start < paths.length; start += SIGN_BATCH_SIZE)
    batches.push(paths.slice(start, start + SIGN_BATCH_SIZE));
  let requests = 0;
  for (let start = 0; start < batches.length; start += SIGN_CONCURRENCY) {
    const requestsNow = batches
      .slice(start, start + SIGN_CONCURRENCY)
      .map((batch) => ({
        method: 'POST',
        url: `${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}`,
        body: JSON.stringify({
          expiresIn: EXPORT_SIGNED_URL_TTL_SECONDS,
          paths: batch,
        }),
        params: authorized({
          session,
          probe,
          headers: { 'Content-Type': 'application/json' },
        }),
      }));
    for (const response of http.batch(requestsNow))
      probeMs.add(response.timings.duration, { probe });
    requests += requestsNow.length;
  }
  return requests;
}
