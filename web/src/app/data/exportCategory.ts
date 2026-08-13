/**
 * Building one category's archive, end to end.
 *
 * There is no server to do this on -- the app is a static export and
 * authorization lives entirely in Row Level Security -- so the whole
 * archive is assembled in the tab: rows over PostgREST, photographs over
 * signed URLs, zipped by `./zip` and handed to the browser as a download.
 *
 * The shape of what comes out is `./exportFormat`'s business, and the ZIP
 * bytes are `./zip`'s. The download itself -- the DOM anchor click -- is
 * presentation, not data, and lives in `CategorySelect/downloadBlob.ts`
 * instead of here. What is left here is the I/O and the order it happens
 * in -- the pagination boundary, the batching, the skip-on-failure loop and
 * the retry/backoff around it -- which used to be exempt from every gate
 * wholesale. It no longer is: the four Supabase/storage calls are accepted
 * as parameters (the file already did this for `now`), so
 * exportCategory.test.ts can drive the logic with fakes. Only the raw calls
 * themselves -- the real Supabase client and `fetch` -- stay outside the
 * gate; see the individual `v8 ignore` / `Stryker disable` markers below.
 */

import { supabase } from '../supabase';
import {
  createSignedUrls,
  listExportImagesForItems,
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
  /** Always 0 -- kept for API stability. Used to count items whose
   * photographs couldn't even be listed after retrying a flaky per-item
   * storage.list() call (#417); a single batched `images` query has no
   * equivalent per-item failure to count, and aborts the export outright
   * on error instead (see fetchPhotoPaths). */
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
 * Above this, an archive risks the failure #428 describes: the Blob-per-entry
 * design is fine on Chromium/Firefox, which page large blobs to disk, but on
 * iOS/WebKit a constructed Blob stays substantially memory-resident and
 * per-tab memory sits around 1-2 GB before the OS kills the tab outright --
 * no toast, no console, the download simply never happens. That is far below
 * `assertZipRoom`'s 4 GiB ZIP-format ceiling, which never gets a chance to
 * raise its own clean error. Conservative on purpose: this is a warning
 * threshold, not the real limit.
 */
export const LARGE_EXPORT_WARN_BYTES = 1.5 * 1024 ** 3;

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
export async function runPool<T>(
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

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Every fetched item's full-size photograph paths and total byte weight, in
 * one batched `images` query (listExportImagesForItems, data/images.ts)
 * rather than one storage.list() call per item -- this used to need its own
 * concurrency pool and retry/backoff (#417, #414) purely because per-item
 * Storage listing was slow and flaky at export scale; a single indexed
 * Postgres query has neither problem, so there is no per-item failure mode
 * left to isolate. A failure here aborts the export the same way a failed
 * items page does (fetchAllItems above) -- there is no longer a natural
 * per-item boundary to blame a partial failure on.
 */
async function fetchPhotoPaths(
  items: ExportItem[],
  listImages: typeof listExportImagesForItems,
  signal?: AbortSignal,
): Promise<{
  photoPathsByItemId: Map<string, string[]>;
  /** Summed from the query's own size_bytes column, so the archive's total
   * weight is known before a single photograph is downloaded (#428). */
  totalBytes: number;
}> {
  checkCancelled(signal);
  const { data, error } = await listImages(items.map((item) => item.id));
  if (error) {
    throw new ExportError('Could not list photographs', { cause: error });
  }

  const photoPathsByItemId = new Map<string, string[]>();
  let totalBytes = 0;
  for (const row of data ?? []) {
    const paths = photoPathsByItemId.get(row.item_id) ?? [];
    paths.push(row.path_full);
    photoPathsByItemId.set(row.item_id, paths);
    totalBytes += row.size_bytes ?? 0;
  }
  return { photoPathsByItemId, totalBytes };
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
  listImages = listExportImagesForItems,
  // Stryker disable next-line all
  // v8 ignore next
  signUrls = createSignedUrls,
  confirmLargeExport,
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
  listImages?: typeof listExportImagesForItems;
  signUrls?: typeof createSignedUrls;
  /** Asked once the archive's total photograph size is known -- listing
   * already carries it in `metadata.size` -- but only when it exceeds
   * `LARGE_EXPORT_WARN_BYTES`. Declining cancels the export the same way the
   * user's own Cancel button does (#428). Omitted, a large export proceeds
   * unprompted -- callers that have nowhere to show a dialog (tests, a
   * future non-interactive caller) are not forced to supply one. */
  confirmLargeExport?: (totalBytes: number) => Promise<boolean> | boolean;
}): Promise<ExportResult> {
  const { data: sessionData } = await getSession();
  if (!sessionData.session?.user.id) throw new ExportError('No user session');

  onProgress?.({ phase: 'items', done: 0, total: 0 });
  const items = await fetchAllItems(category.id, listItems, signal);

  // Fully-qualified paths straight from the images table -- unlike the old
  // storage.list()-based listing, there is no per-item owner prefix to
  // build here, so this needs nothing from the session beyond the guard
  // above.
  const { photoPathsByItemId, totalBytes } = await fetchPhotoPaths(
    items,
    listImages,
    signal,
  );

  if (totalBytes > LARGE_EXPORT_WARN_BYTES && confirmLargeExport) {
    checkCancelled(signal);
    const proceed = await confirmLargeExport(totalBytes);
    if (!proceed) throw new ExportCancelledError();
  }

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
    // Always 0: a photo-listing failure now aborts the whole export
    // (fetchPhotoPaths throws) rather than skipping the one item whose
    // storage.list() call failed -- there is no per-item listing left to
    // fail independently. Kept in the result shape rather than removed, so
    // useExportCategory.tsx's `skippedItemCount > 0` check needs no change.
    skippedItemCount: 0,
  };
}
