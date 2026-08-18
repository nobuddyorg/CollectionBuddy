/**
 * Building one category's archive, end to end.
 *
 * No server: this is a static export, so the whole archive is assembled in
 * the tab, with authorization enforced entirely by Postgres Row Level
 * Security. Rows come over PostgREST, photographs over signed URLs, zipped
 * by `./zip`. The download itself (the DOM anchor click) lives in
 * `CategorySelect/downloadBlob.ts`, not here.
 *
 * The four Supabase/storage calls are accepted as parameters, like `now`
 * already was, so exportCategory.test.ts can drive this with fakes. Only
 * the real Supabase client and `fetch` stay outside the gate; see the
 * `v8 ignore` / `Stryker disable` markers below.
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
import { runPool } from '../lib/pool';

/** How far an export has got. `total` is 0 until items and photos are counted. */
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
  /** Always 0, kept for API stability: a batched `images` query (see
   * fetchPhotoPaths) has no per-item listing failure left to count. */
  skippedItemCount: number;
};

/** PostgREST caps a response, so items are walked a page at a time until a short page ends it. */
export const ITEM_PAGE_SIZE = 500;

/** How many photographs are signed in one call, so a failed batch only takes its own photographs down with it. */
export const SIGN_BATCH_SIZE = 100;

/**
 * Above this, iOS/WebKit risks killing the tab outright with no error: a
 * constructed Blob stays memory-resident there (unlike Chromium/Firefox,
 * which page large blobs to disk), and per-tab memory tops out around
 * 1-2 GB. Well below `assertZipRoom`'s 4 GiB ZIP-format ceiling, which
 * never gets a chance to raise its own error first. A conservative warning
 * threshold, not the real limit.
 */
export const LARGE_EXPORT_WARN_BYTES = 1.5 * 1024 ** 3;

/** Signed URLs default to a 1-hour TTL, which a large export on a slow
 * connection can outlive; asked for with room to spare so a URL never
 * expires mid-download. */
const SIGNED_URL_TTL_SECONDS = 6 * 3600;

export class ExportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ExportError';
  }
}

/** Thrown when the caller's `signal` is aborted -- a user-requested cancel,
 * not a failure -- so the UI can stay quiet about it instead of reporting a
 * "try again" that misdescribes what happened. */
export class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelledError';
  }
}

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExportCancelledError();
}

// A named reference rather than an inline arrow at the default-parameter
// site below: v8 tracks an inline arrow as its own function, and since
// tests always supply a fake, that function would show as uncalled no
// matter how the statement itself is ignored.
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
 * one batched `images` query rather than one storage.list() call per item --
 * a single indexed Postgres query has no per-item failure mode, so a
 * failure here aborts the export the same way a failed items page does.
 */
async function fetchPhotoPaths(
  items: ExportItem[],
  listImages: typeof listExportImagesForItems,
  signal?: AbortSignal,
): Promise<{
  photoPathsByItemId: Map<string, string[]>;
  /** Summed from the query's own size_bytes column, so the archive's total
   * weight is known before a single photograph is downloaded. */
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

// Over hundreds of photographs, a radio blip, a 5xx or a rate limit is
// common enough that one failed request must not mean one permanently
// missing photograph.
const PHOTO_FETCH_ATTEMPTS = 3;
const PHOTO_RETRY_BASE_MS = 500;

/** Bounded rather than unbounded so only a handful of response Blobs are
 * ever held in memory at once; the writer turns each into a Blob off the
 * JS heap as soon as it's added. */
export const PHOTO_DOWNLOAD_CONCURRENCY = 6;

/** Browser `fetch` has no response timeout of its own, so a stalled
 * response would otherwise hang forever. Long enough that a real photo on a
 * slow connection is never mistaken for a stall. */
export const PHOTO_FETCH_TIMEOUT_MS = 30_000;

/** Distinguishes a response retrying cannot fix (a 404 is a 404 three times over). */
class PermanentFetchError extends Error {}

/** ORs the caller's cancellation with a fresh per-attempt timeout, so
 * neither a user cancel nor a black-holed connection hangs the request. */
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
      // A cancel and a per-attempt timeout both surface as an aborted
      // fetch; only the caller's own signal aborting means "stop
      // altogether" -- a timeout is retried like any other failure below.
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
    // Stryker disable next-line ArrayDeclaration: any placeholder here still
    // fails the row.path/row.signedUrl guard below just as `[]` does.
    for (const row of data ?? []) {
      // Stryker disable next-line all: a null path becomes a Map key no
      // real photograph path ever looks up, and a null signedUrl fails the
      // `!url` check downstream the same way a dropped entry does -- not
      // observable from outside signAll either way.
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
 * still worth having, and the manifest still names what should have been
 * there. It must never go missing silently, since the canonical use of an
 * export is "export, then delete the originals".
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
   * work promptly rather than only once the current phase finishes. */
  signal?: AbortSignal;
  getSession?: () => ReturnType<typeof supabase.auth.getSession>;
  listItems?: typeof listItemsForExport;
  listImages?: typeof listExportImagesForItems;
  signUrls?: typeof createSignedUrls;
  /** Asked once the total photograph size is known, only when it exceeds
   * `LARGE_EXPORT_WARN_BYTES`. Declining cancels the export the same way
   * the user's own Cancel button does. Omitted, a large export proceeds
   * unprompted, so a caller with nowhere to show a dialog isn't forced to
   * supply one. */
  confirmLargeExport?: (totalBytes: number) => Promise<boolean> | boolean;
}): Promise<ExportResult> {
  const { data: sessionData } = await getSession();
  if (!sessionData.session?.user.id) throw new ExportError('No user session');

  onProgress?.({ phase: 'items', done: 0, total: 0 });
  const items = await fetchAllItems(category.id, listItems, signal);

  // Paths come fully-qualified from the images table, so nothing here
  // needs the session beyond the guard above.
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

  const tasks = entries.flatMap((entry) => entry.photos);
  const total = tasks.length;
  onProgress?.({ phase: 'photos', done, total });

  // A ZipLimitError or a cancellation stops the whole pool rather than
  // being counted as one more skipped photograph: the export as a whole has
  // failed or been called off, a different thing from one picture that
  // could not be fetched.
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
    skippedItemCount: 0,
  };
}
