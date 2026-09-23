import { chunk } from '../lib/chunk';
import { supabase } from '../supabase';
import {
  createSignedUrls,
  listExportImagesForItems,
  ITEM_IMAGES_BUCKET,
} from './images';
import { listItemsForExport, type ExportCursor } from './exportItemPages';
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
import { attempts, backoffDelayMs } from '../lib/backoff';

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
  /** Always 0: the batched `images` query has no per-item listing failure to count. */
  skippedItemCount: number;
};

/** PostgREST caps a response, so items are walked a page at a time until a short page ends it. */
export const ITEM_PAGE_SIZE = 500;

/** Photographs signed per call, so a failed batch only takes its own photographs down with it. */
export const SIGN_BATCH_SIZE = 100;

/** Sign calls in flight at once, bounded like the photo downloads. */
export const SIGN_CONCURRENCY = 6;

/** iOS/WebKit keeps a Blob in memory and kills a tab near 1-2 GB, well before the 4 GiB ZIP limit. */
export const LARGE_EXPORT_WARN_BYTES = 1.5 * 1024 ** 3;

/** A large export on a slow connection can outlive the default 1-hour signed-URL TTL. */
const EXPORT_SIGNED_URL_TTL_SECONDS = 6 * 3600;

export class ExportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ExportError';
  }
}

/** Thrown when the caller's `signal` aborts: a user-requested cancel, not a failure. */
export class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled');
    this.name = 'ExportCancelledError';
  }
}

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ExportCancelledError();
}

function realGetSession() {
  return supabase.auth.getSession();
}

/** Walks every page of a category's items, reporting the running count. */
async function fetchAllItems({
  categoryId,
  listItems,
  onProgress,
  signal,
}: {
  categoryId: string;
  listItems: typeof listItemsForExport;
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
}): Promise<ExportItem[]> {
  const items: ExportItem[] = [];
  let after: ExportCursor | null = null;
  do {
    checkCancelled(signal);
    const page = await listItems({ categoryId, after, size: ITEM_PAGE_SIZE });
    if (page.error !== null) {
      throw new ExportError('Could not read items', { cause: page.error });
    }
    items.push(...page.data.items);
    onProgress?.({ phase: 'items', done: items.length, total: 0 });
    after = page.data.next;
  } while (after);
  return items;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Every item's full-size paths and total bytes from one `images` query, which fails as a whole. */
async function fetchPhotoPaths({
  items,
  listImages,
  signal,
}: {
  items: ExportItem[];
  listImages: typeof listExportImagesForItems;
  signal?: AbortSignal;
}): Promise<{
  photoPathsByItemId: Map<string, string[]>;
  totalBytes: number;
}> {
  checkCancelled(signal);
  const { data, error } = await listImages(items.map((item) => item.id));
  // No rows is `[]`; a null payload means the query did not answer, not an archive without photos.
  if (error || !data) {
    throw new ExportError('Could not list photographs', { cause: error });
  }

  const photoPathsByItemId = new Map<string, string[]>();
  let totalBytes = 0;
  for (const row of data) {
    const paths = photoPathsByItemId.get(row.item_id) ?? [];
    paths.push(row.path_full);
    photoPathsByItemId.set(row.item_id, paths);
    totalBytes += row.size_bytes ?? 0;
  }
  return { photoPathsByItemId, totalBytes };
}

const PHOTO_FETCH_ATTEMPTS = 3;
const PHOTO_RETRY_BASE_MS = 500;

/** Bounded so only a handful of response Blobs are ever held in memory at once. */
export const PHOTO_DOWNLOAD_CONCURRENCY = 6;

/** Browser `fetch` has no response timeout of its own, so a stalled response would hang forever. */
export const PHOTO_FETCH_TIMEOUT_MS = 30_000;

/** A response retrying cannot fix: a 404 is a 404 three times over. */
class PermanentFetchError extends Error {}

/** The caller's cancellation OR'd with a fresh per-attempt timeout. */
function fetchSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(PHOTO_FETCH_TIMEOUT_MS);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
}

async function fetchPhotoBytes(
  url: string,
  signal?: AbortSignal,
): Promise<Uint8Array<ArrayBuffer>> {
  let lastError: unknown;
  for (const attempt of attempts(PHOTO_FETCH_ATTEMPTS)) {
    checkCancelled(signal);
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, backoffDelayMs(PHOTO_RETRY_BASE_MS, attempt - 1)),
      );
    }
    try {
      const response = await fetch(url, { signal: fetchSignal(signal) });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      if (!isRetryableStatus(response.status)) {
        throw new PermanentFetchError(`HTTP ${response.status}`);
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      if (error instanceof PermanentFetchError) throw error;
      // A cancel and a per-attempt timeout both abort the fetch; only the caller's signal stops.
      checkCancelled(signal);
      lastError = error;
    }
  }
  throw lastError;
}

/** A row Storage could not sign leaves no entry behind at all. */
export async function signAll({
  paths,
  signUrls,
  signal,
}: {
  paths: string[];
  signUrls: typeof createSignedUrls;
  signal?: AbortSignal;
}): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  await runPool(
    chunk(paths, SIGN_BATCH_SIZE),
    SIGN_CONCURRENCY,
    async (batch) => {
      checkCancelled(signal);
      const result = await signUrls(batch, EXPORT_SIGNED_URL_TTL_SECONDS);
      if (result.error) {
        throw new ExportError('Could not sign photograph URLs', {
          cause: result.error,
        });
      }
      for (const row of result.data) {
        if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
      }
    },
  );
  return signed;
}

/** Builds the archive; a photograph unfetchable after retrying is skipped and counted, never silent. */
export async function exportCategory({
  category,
  onProgress,
  now = () => new Date(),
  signal,
  getSession = realGetSession,
  listItems = listItemsForExport,
  listImages = listExportImagesForItems,
  signUrls = createSignedUrls,
  confirmLargeExport,
}: {
  category: { id: string; name: string };
  onProgress?: (progress: ExportProgress) => void;
  now?: () => Date;
  /** Checked between phases, between batches and before every retry. */
  signal?: AbortSignal;
  getSession?: () => ReturnType<typeof supabase.auth.getSession>;
  listItems?: typeof listItemsForExport;
  listImages?: typeof listExportImagesForItems;
  signUrls?: typeof createSignedUrls;
  /** Asked only past `LARGE_EXPORT_WARN_BYTES`; declining cancels, omitting it skips the prompt. */
  confirmLargeExport?: (totalBytes: number) => Promise<boolean> | boolean;
}): Promise<ExportResult> {
  const { data: sessionData } = await getSession();
  if (!sessionData.session?.user.id) throw new ExportError('No user session');

  onProgress?.({ phase: 'items', done: 0, total: 0 });
  const items = await fetchAllItems({
    categoryId: category.id,
    listItems,
    onProgress,
    signal,
  });

  const { photoPathsByItemId, totalBytes } = await fetchPhotoPaths({
    items,
    listImages,
    signal,
  });

  if (totalBytes > LARGE_EXPORT_WARN_BYTES && confirmLargeExport) {
    checkCancelled(signal);
    const proceed = await confirmLargeExport(totalBytes);
    if (!proceed) throw new ExportCancelledError();
  }

  const entries = exportEntries(items, photoPathsByItemId);

  const storagePaths = entries.flatMap((entry) =>
    entry.photos.map((photo) => photo.storagePath),
  );
  const signed = await signAll({ paths: storagePaths, signUrls, signal });

  const exportedAt = now();
  const archiveRoot = archiveRootFolder(category.name, exportedAt);
  const writer = createZipWriter();
  let done = 0;
  let skipped = 0;

  const tasks = entries.flatMap((entry) => entry.photos);
  const total = tasks.length;
  onProgress?.({ phase: 'photos', done, total });

  // A ZipLimitError or a cancellation fails the whole export, not one more skipped photograph.
  await runPool(tasks, PHOTO_DOWNLOAD_CONCURRENCY, async (task) => {
    checkCancelled(signal);
    const url = signed.get(task.storagePath);
    try {
      if (!url) throw new Error(`Unsigned path in ${ITEM_IMAGES_BUCKET}`);
      const bytes = await fetchPhotoBytes(url, signal);
      writer.add({
        path: `${archiveRoot}/${task.archivePath}`,
        bytes,
        modified: exportedAt,
      });
    } catch (error) {
      if (
        error instanceof ZipLimitError ||
        error instanceof ExportCancelledError
      ) {
        throw error;
      }
      console.error('Skipping photograph', task.storagePath, error);
      skipped++;
    }
    onProgress?.({ phase: 'photos', done: ++done, total });
  });

  onProgress?.({ phase: 'packing', done: total, total });

  const encoder = new TextEncoder();
  const manifest = buildManifest({ category, entries, exportedAt });
  writer.add({
    path: `${archiveRoot}/${MANIFEST_NAME}`,
    bytes: encoder.encode(JSON.stringify(manifest, null, 2)),
    modified: exportedAt,
  });
  writer.add({
    path: `${archiveRoot}/${CSV_NAME}`,
    bytes: encoder.encode(buildCsv(entries)),
    modified: exportedAt,
  });

  return {
    blob: writer.finish(),
    filename: archiveName(category.name, exportedAt),
    itemCount: items.length,
    photoCount: total - skipped,
    skippedPhotoCount: skipped,
    skippedItemCount: 0,
  };
}
