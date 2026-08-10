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
  archiveRootFolder,
  buildCsv,
  buildManifest,
  CSV_NAME,
  exportEntries,
  fullSizeObjectPaths,
  MANIFEST_NAME,
  type ExportItem,
} from './exportFormat';
import { createZipWriter, ZipLimitError } from './zip';

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
  /** Items whose photographs could not even be listed after retrying, so
   * none of them made it into `skippedPhotoCount` -- they were never
   * counted among the attempts at all (#417). */
  skippedItemCount: number;
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

/** Thrown when the caller's `signal` is aborted -- a user-requested cancel,
 * not a failure. Distinguished from every other error so the UI can stay
 * quiet about it instead of reporting a "try again" that misdescribes what
 * happened (#418). */
export class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelledError';
  }
}

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExportCancelledError();
}

/**
 * Runs `worker` over `items` through a fixed-size pool of concurrent
 * runners, in place of either the whole array at once or one at a time.
 * Results land at the same index the input item held, regardless of which
 * runner finished it or in what order -- callers that care about order (the
 * ZIP does not, but a human reading a diff might) get it for free.
 */
async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  // Stryker disable next-line ArrayDeclaration: pre-sizing is an allocation
  // hint, not a length assertion -- `results[i] = ...` grows a shorter (or
  // zero-length) array exactly the same way, so there is no behavior here
  // for a test to observe either way.
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        results[i] = await worker(items[i]);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

// Every worker in this codebase only ever throws a real Error (or one of
// its subclasses, e.g. ExportCancelledError/ZipLimitError) -- this exists
// so a caught value that somehow isn't one still comes out as one, not
// because the fallback is expected to fire.
// Stryker disable all
/* v8 ignore start */
function throwAsError(err: unknown): never {
  if (err instanceof Error) throw err;
  throw new Error(String(err));
}
/* v8 ignore stop */
// Stryker restore all

/**
 * Same pool, but for a worker that can fail the whole run: the first
 * rejection stops every runner from picking up further items (in-flight
 * work is left to settle on its own) and is rethrown once they all have --
 * used where one failure means the export itself must stop, not skip one
 * entry and carry on (ZipLimitError, ExportCancelledError).
 */
async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  let poolError: unknown;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (;;) {
        if (poolError !== undefined) return;
        const i = next++;
        if (i >= items.length) return;
        try {
          await worker(items[i]);
        } catch (err) {
          if (poolError === undefined) poolError = err;
          return;
        }
      }
    },
  );
  await Promise.all(runners);
  if (poolError !== undefined) throwAsError(poolError);
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
  signal?: AbortSignal,
): Promise<ExportItem[]> {
  const items: ExportItem[] = [];
  for (let page = 0; ; page++) {
    checkCancelled(signal);
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

/**
 * How many listings run at once. Storage has no listing that crosses
 * prefixes, so this is one call per item however it is written -- but a
 * category of 500 items firing 500 simultaneous requests is exactly the
 * self-inflicted 429 burst the signing batch above and the geocoder queue
 * (`usePlaces.tsx`'s `GEOCODE_CONCURRENCY`) already learned to avoid (#417).
 */
export const LISTING_CONCURRENCY = 16;

/**
 * Retried the same way a photograph fetch is (#414): a listing is one
 * Storage API call, and a radio blip or a rate limit is exactly as likely
 * to hit it as any other request in this export.
 */
const LISTING_FETCH_ATTEMPTS = 3;
const LISTING_RETRY_BASE_MS = 500;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Lists one item's photographs, retrying a transient failure the same way
 * `fetchPhotoBytes` does. A `status` the Storage client didn't attach at all
 * (a network failure rather than an HTTP response) is treated as retryable,
 * on the same reasoning as a rejected `fetch` below -- there is no response
 * to say otherwise.
 */
async function listOnePrefix(
  prefix: string,
  listImages: typeof listAllImageObjects,
  signal?: AbortSignal,
): Promise<{ data: { name: string }[] | null; error: unknown }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < LISTING_FETCH_ATTEMPTS; attempt++) {
    checkCancelled(signal);
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, LISTING_RETRY_BASE_MS * 2 ** (attempt - 1)),
      );
    }
    try {
      const { data, error } = await listImages(prefix);
      if (!error) return { data, error: null };
      const status = (error as { status?: number }).status;
      if (status !== undefined && !isRetryableStatus(status)) {
        return { data: null, error };
      }
      lastErr = error;
    } catch (err) {
      lastErr = err;
    }
  }
  return { data: null, error: lastErr };
}

/**
 * Lists every item's photographs through a bounded pool rather than one
 * unbounded burst (#417). An item whose listing still fails after retrying
 * is not allowed to abort the whole export -- it is logged and counted
 * (`skippedItemCount`, reported the same way a skipped photograph already
 * is per #414) and its photographs are simply absent, the same shape as an
 * item that genuinely has none.
 */
async function fetchPhotoPaths(
  uid: string,
  items: ExportItem[],
  listImages: typeof listAllImageObjects,
  signal?: AbortSignal,
): Promise<{
  photoPathsByItemId: Map<string, string[]>;
  skippedItemCount: number;
}> {
  let skippedItemCount = 0;
  const listings = await mapPool(items, LISTING_CONCURRENCY, async (item) => {
    checkCancelled(signal);
    const prefix = `${uid}/${item.id}`;
    const { data, error } = await listOnePrefix(prefix, listImages, signal);
    if (error) {
      console.error("Skipping item's photographs", item.id, error);
      skippedItemCount++;
      return [item.id, [] as string[]] as const;
    }
    return [item.id, fullSizeObjectPaths(prefix, data ?? [])] as const;
  });
  return { photoPathsByItemId: new Map(listings), skippedItemCount };
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

/**
 * How many photographs download at once (#420). Fetching them in parallel
 * -- rather than the one-at-a-time loop this used to be -- would hold every
 * response in memory at once only if the pool were unbounded; a handful of
 * workers holds a handful of Blobs, and the writer already turns each one
 * into a Blob (off the JS heap) the moment it is added.
 */
export const PHOTO_DOWNLOAD_CONCURRENCY = 6;

/**
 * A stalled response otherwise hangs forever: browser `fetch` has no
 * response timeout of its own (#418). Long enough that a real photograph on
 * a slow connection is never mistaken for a stall -- the retry loop below is
 * what a genuinely bad connection needs, not a shorter fuse here.
 */
export const PHOTO_FETCH_TIMEOUT_MS = 30_000;

/** Distinguishes a response retrying cannot fix (a 404 is a 404 three times over). */
class PermanentFetchError extends Error {}

/**
 * The signal a single `fetch` is given: the caller's cancellation, ORed
 * with a fresh per-attempt timeout so neither a user-requested cancel nor a
 * black-holed connection can hang the request indefinitely.
 */
function fetchSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(PHOTO_FETCH_TIMEOUT_MS);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
}

async function fetchPhotoBytes(
  url: string,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < PHOTO_FETCH_ATTEMPTS; attempt++) {
    checkCancelled(signal);
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, PHOTO_RETRY_BASE_MS * 2 ** (attempt - 1)),
      );
    }
    try {
      const response = await fetch(url, { signal: fetchSignal(signal) });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      if (!isRetryableStatus(response.status)) {
        throw new PermanentFetchError(`HTTP ${response.status}`);
      }
      lastErr = new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (err instanceof PermanentFetchError) throw err;
      // A cancel and a mere per-attempt timeout both surface as an aborted
      // fetch; only the caller's own signal being aborted means "stop
      // altogether" -- a timeout is retried like any other transient
      // failure below.
      checkCancelled(signal);
      lastErr = err;
    }
  }
  throw lastErr;
}

async function signAll(
  paths: string[],
  signUrls: typeof createSignedUrls,
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  for (let i = 0; i < paths.length; i += SIGN_BATCH_SIZE) {
    checkCancelled(signal);
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
  signal,
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
  /** Aborted to cancel a run in progress -- checked between phases, between
   * batches within a phase, and before every retry, so cancelling stops new
   * work promptly rather than only once the current phase finishes (#418). */
  signal?: AbortSignal;
  getSession?: () => ReturnType<typeof supabase.auth.getSession>;
  listItems?: typeof listItemsForExport;
  listImages?: typeof listAllImageObjects;
  signUrls?: typeof createSignedUrls;
}): Promise<ExportResult> {
  const { data: sessionData } = await getSession();
  const uid = sessionData.session?.user.id;
  if (!uid) throw new ExportError('No user session');

  onProgress?.({ phase: 'items', done: 0, total: 0 });
  const items = await fetchAllItems(category.id, listItems, signal);

  const { photoPathsByItemId, skippedItemCount } = await fetchPhotoPaths(
    uid,
    items,
    listImages,
    signal,
  );
  const entries = exportEntries(items, photoPathsByItemId);

  const storagePaths = entries.flatMap((entry) =>
    entry.photos.map((p) => p.storagePath),
  );
  const signed = await signAll(storagePaths, signUrls, signal);

  const exportedAt = now();
  const archiveRoot = archiveRootFolder(category.name, exportedAt);
  const writer = createZipWriter();
  let done = 0;
  let skipped = 0;

  // Flattened once up front so the download pool below can pull work items
  // off a plain array -- each one already the storage/archive pair
  // `exportEntries` built, not re-derived per entry (#421).
  const tasks = entries.flatMap((entry) => entry.photos);
  const total = tasks.length;
  onProgress?.({ phase: 'photos', done, total });

  // A bounded pool rather than one photograph at a time (#420) or every
  // photograph at once (which would hold every response in memory
  // simultaneously): a handful of workers holds a handful of Blobs, and the
  // writer already turns each one into a Blob -- off the JS heap -- the
  // moment it is added. A ZipLimitError or a cancellation stops the whole
  // pool rather than being counted as one more skipped photograph (#416,
  // #418): the export as a whole has failed or been called off, which is a
  // different thing from one picture that could not be fetched.
  await runPool(tasks, PHOTO_DOWNLOAD_CONCURRENCY, async (task) => {
    checkCancelled(signal);
    const url = signed.get(task.storagePath);
    try {
      if (!url) throw new Error(`Unsigned path in ${ITEM_IMAGES_BUCKET}`);
      const bytes = await fetchPhotoBytes(url, signal);
      writer.add(`${archiveRoot}/${task.archivePath}`, bytes, exportedAt);
    } catch (err) {
      if (err instanceof ZipLimitError || err instanceof ExportCancelledError) {
        throw err;
      }
      console.error('Skipping photograph', task.storagePath, err);
      skipped++;
    }
    onProgress?.({ phase: 'photos', done: ++done, total });
  });

  onProgress?.({ phase: 'packing', done: total, total });

  const encoder = new TextEncoder();
  const manifest = buildManifest({ category, entries, exportedAt });
  writer.add(
    `${archiveRoot}/${MANIFEST_NAME}`,
    encoder.encode(JSON.stringify(manifest, null, 2)),
    exportedAt,
  );
  writer.add(
    `${archiveRoot}/${CSV_NAME}`,
    encoder.encode(buildCsv(entries)),
    exportedAt,
  );

  return {
    blob: writer.finish(),
    filename: archiveName(category.name, exportedAt),
    itemCount: items.length,
    photoCount: total - skipped,
    skippedPhotoCount: skipped,
    skippedItemCount,
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
