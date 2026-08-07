/**
 * Building one category's archive, end to end.
 *
 * There is no server to do this on -- the app is a static export and
 * authorization lives entirely in Row Level Security -- so the whole
 * archive is assembled in the tab: rows over PostgREST, photographs over
 * signed URLs, zipped by `./zip` and handed to the browser as a download.
 *
 * The shape of what comes out is `./exportFormat`'s business, and the ZIP
 * bytes are `./zip`'s. What is left here is the I/O and the order it
 * happens in -- the pagination boundary, the batching, the skip-on-failure
 * loop and the retry/backoff around it -- which used to be exempt from
 * every gate wholesale. It no longer is: the four Supabase/storage calls
 * are accepted as parameters (the file already did this for `now`), so
 * exportCategory.test.ts can drive the logic with fakes. Only the raw calls
 * themselves -- the real Supabase client, `fetch`, and the DOM anchor
 * `downloadBlob` clicks -- stay outside the gate; see the individual
 * `v8 ignore` / `Stryker disable` markers below.
 */

import { supabase } from '../supabase';
import {
  createSignedUrls,
  listAllImageObjects,
  ITEM_IMAGES_BUCKET,
} from './images';
import { listItemsForExport } from './items';
import {
  archiveName,
  buildCsv,
  buildManifest,
  CSV_NAME,
  exportEntries,
  fullSizeObjectPaths,
  MANIFEST_NAME,
  type ExportItem,
} from './exportFormat';
import { createZipWriter } from './zip';

/**
 * How far an export has got. `total` is only known once the items are in
 * and their photographs counted, so it is 0 for the first phase.
 */
export type ExportProgress = {
  phase: 'items' | 'photos' | 'packing';
  done: number;
  total: number;
};

export type ExportResult = {
  blob: Blob;
  filename: string;
  itemCount: number;
  /** Photographs actually written to the archive -- not photographs attempted. */
  photoCount: number;
  /** Photographs that could not be fetched after retrying, and were left out. */
  skippedPhotoCount: number;
};

/**
 * PostgREST caps a response, and a collection can be larger than one page,
 * so items are walked a page at a time until a short page ends it.
 */
export const ITEM_PAGE_SIZE = 500;

/**
 * How many photographs are signed in one call. Signing is cheap but the
 * URL list is not unbounded, and a batch that fails takes only its own
 * photographs down with it.
 */
export const SIGN_BATCH_SIZE = 100;

/**
 * Signed URLs last an hour by default. An export of a large collection on
 * a slow connection can outlive that, so they are asked for with room to
 * spare -- a URL that expires mid-download would fail a photograph that
 * was otherwise perfectly readable.
 */
const SIGNED_URL_TTL_SECONDS = 6 * 3600;

export class ExportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ExportError';
  }
}

// A named reference rather than an inline arrow at the default-parameter
// site below: an inline arrow is itself a function v8 tracks separately
// from the statement that defines it, and a test that always supplies a
// fake (so this default never runs) leaves that function looking uncalled
// no matter how the statement itself is ignored. A plain reference, like
// the other three raw-call defaults, has nothing of its own to be uncalled.
// Stryker disable next-line all
// v8 ignore next
function realGetSession() {
  return supabase.auth.getSession();
}

/** Walks every page of a category's items, one call per `ITEM_PAGE_SIZE`. */
async function fetchAllItems(
  categoryId: string,
  listItems: typeof listItemsForExport,
): Promise<ExportItem[]> {
  const items: ExportItem[] = [];
  for (let page = 0; ; page++) {
    const from = page * ITEM_PAGE_SIZE;
    const { data, error } = await listItems(
      categoryId,
      from,
      from + ITEM_PAGE_SIZE - 1,
    );
    if (error) throw new ExportError('Could not read items', { cause: error });
    if (!data?.length) break;
    items.push(...data);
    if (data.length < ITEM_PAGE_SIZE) break;
  }
  return items;
}

async function fetchPhotoPaths(
  uid: string,
  items: ExportItem[],
  listImages: typeof listAllImageObjects,
): Promise<Map<string, string[]>> {
  // Storage has no listing that crosses prefixes, so this is one call per
  // item however it is written -- but they need not wait on each other.
  const listings = await Promise.all(
    items.map(async (item) => {
      const prefix = `${uid}/${item.id}`;
      const { data, error } = await listImages(prefix);
      if (error) {
        throw new ExportError('Could not list photographs', { cause: error });
      }
      return [item.id, fullSizeObjectPaths(prefix, data ?? [])] as const;
    }),
  );
  return new Map(listings);
}

/**
 * How many times a photograph's fetch is retried, and the backoff between
 * attempts. The geocoder already gets three tries with backoff for the same
 * reason: over an export of hundreds of photographs, a radio blip, a 5xx or
 * a rate limit is common enough that one failed request must not mean one
 * permanently missing photograph (#414).
 */
const PHOTO_FETCH_ATTEMPTS = 3;
const PHOTO_RETRY_BASE_MS = 500;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Distinguishes a response retrying cannot fix (a 404 is a 404 three times over). */
class PermanentFetchError extends Error {}

async function fetchPhotoBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < PHOTO_FETCH_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, PHOTO_RETRY_BASE_MS * 2 ** (attempt - 1)),
      );
    }
    try {
      const response = await fetch(url);
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      if (!isRetryableStatus(response.status)) {
        throw new PermanentFetchError(`HTTP ${response.status}`);
      }
      lastErr = new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (err instanceof PermanentFetchError) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

async function signAll(
  paths: string[],
  signUrls: typeof createSignedUrls,
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  for (let i = 0; i < paths.length; i += SIGN_BATCH_SIZE) {
    const batch = paths.slice(i, i + SIGN_BATCH_SIZE);
    const { data, error } = await signUrls(batch, SIGNED_URL_TTL_SECONDS);
    if (error) {
      throw new ExportError('Could not sign photograph URLs', { cause: error });
    }
    // Stryker disable next-line ArrayDeclaration: any placeholder here
    // (including Stryker's own sentinel string) fails the row.path/
    // row.signedUrl guard immediately below just as `[]` does -- signed
    // ends up empty either way, and nothing downstream reads this Map by
    // any key but a real photograph path.
    for (const row of data ?? []) {
      // Stryker disable next-line all: every mutant on this condition
      // (||, always-true) still only ever stores a Map entry keyed or
      // valued by whichever half is present -- a null path becomes a key
      // no real photograph path ever looks up, and a null signedUrl fails
      // the `!url` check downstream the exact same way a dropped entry
      // does. Nothing outside signAll reads this Map by any key but a
      // real path, so none of this is observable from exportCategory.
      if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
    }
  }
  return signed;
}

/**
 * Builds the archive for one category.
 *
 * A photograph that still cannot be fetched after retrying is reported and
 * skipped rather than failing the export: an archive missing one picture is
 * worth having, and the manifest still names what should have been there,
 * so the gap is visible in the archive itself as well as in
 * `skippedPhotoCount` -- silently is the one way it must not go missing,
 * since the canonical use of an export is "export, then delete the
 * originals" (#414).
 *
 * `getSession`/`listItems`/`listImages`/`signUrls` are accepted as
 * parameters, same as `now` already was, so exportCategory.test.ts can
 * drive the pagination boundary, the skip path and the batching with
 * fakes instead of a real database (#415).
 */
export async function exportCategory({
  category,
  onProgress,
  now = () => new Date(),
  // The four raw calls this file makes: real by default, faked in tests.
  getSession = realGetSession,
  // Stryker disable next-line all
  // v8 ignore next
  listItems = listItemsForExport,
  // Stryker disable next-line all
  // v8 ignore next
  listImages = listAllImageObjects,
  // Stryker disable next-line all
  // v8 ignore next
  signUrls = createSignedUrls,
}: {
  category: { id: string; name: string };
  onProgress?: (progress: ExportProgress) => void;
  now?: () => Date;
  getSession?: () => ReturnType<typeof supabase.auth.getSession>;
  listItems?: typeof listItemsForExport;
  listImages?: typeof listAllImageObjects;
  signUrls?: typeof createSignedUrls;
}): Promise<ExportResult> {
  const { data: sessionData } = await getSession();
  const uid = sessionData.session?.user.id;
  if (!uid) throw new ExportError('No user session');

  onProgress?.({ phase: 'items', done: 0, total: 0 });
  const items = await fetchAllItems(category.id, listItems);

  const photoPathsByItemId = await fetchPhotoPaths(uid, items, listImages);
  const entries = exportEntries(items, photoPathsByItemId);

  // Never undefined: fetchPhotoPaths sets an entry (possibly empty) for
  // every id in this same `items` array, so there is no id here it hasn't
  // already accounted for.
  const storagePaths = items.flatMap((item) =>
    photoPathsByItemId.get(item.id)!,
  );
  const signed = await signAll(storagePaths, signUrls);

  const exportedAt = now();
  const writer = createZipWriter();
  let done = 0;
  let skipped = 0;
  const total = storagePaths.length;
  onProgress?.({ phase: 'photos', done, total });

  // One photograph at a time, on purpose. Fetching them in parallel would
  // hold every response in memory at once; the writer is built so that
  // each set of bytes becomes a Blob and stops being heap the moment it is
  // added, and that only helps if they arrive one after another.
  for (const entry of entries) {
    // Same guarantee as storagePaths above.
    const stored = photoPathsByItemId.get(entry.item.id)!;
    for (let i = 0; i < stored.length; i++) {
      const url = signed.get(stored[i]);
      try {
        if (!url) throw new Error(`Unsigned path in ${ITEM_IMAGES_BUCKET}`);
        const bytes = await fetchPhotoBytes(url);
        writer.add(entry.photos[i], bytes, exportedAt);
      } catch (err) {
        console.error('Skipping photograph', stored[i], err);
        skipped++;
      }
      onProgress?.({ phase: 'photos', done: ++done, total });
    }
  }

  onProgress?.({ phase: 'packing', done: total, total });

  const encoder = new TextEncoder();
  const manifest = buildManifest({ category, entries, exportedAt });
  writer.add(
    MANIFEST_NAME,
    encoder.encode(JSON.stringify(manifest, null, 2)),
    exportedAt,
  );
  writer.add(CSV_NAME, encoder.encode(buildCsv(entries)), exportedAt);

  return {
    blob: writer.finish(),
    filename: archiveName(category.name, exportedAt),
    itemCount: items.length,
    photoCount: total - skipped,
    skippedPhotoCount: skipped,
  };
}

/* v8 ignore start -- DOM anchor click, not logic; exercised by the
 * signed-in e2e export spec, not by a unit test. */
// Stryker disable all: DOM plumbing only.
/** Hands a finished archive to the browser as a download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next turn rather than immediately: Safari has been known
  // to cancel a download whose object URL is released in the same tick as
  // the click that started it.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
// Stryker restore all
/* v8 ignore stop */
