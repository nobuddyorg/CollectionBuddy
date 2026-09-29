import { chunk } from '../lib/chunk';
import {
  createSignedUrls,
  isTransientStorageError,
  type ExportImageRow,
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
  type ExportEntry,
  type ExportItem,
} from './exportFormat';
import { createZipWriter, type ZipWriter } from './zip';
import { checkCancelled, ExportCancelledError } from './exportCancellation';
import {
  downloadPhotosInto,
  RETRY_ATTEMPTS,
  RETRY_BASE_MS,
} from './exportPhotos';
import { runPool } from '../lib/pool';
import { retryWithBackoff } from '../lib/backoff';

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
};

/** PostgREST caps a response, so items are walked a page at a time until a short page ends it. */
export const ITEM_PAGE_SIZE = 500;

/** Photographs signed per call, well under Storage's 1,000, so six calls share the work; a batch failing its retries fails the export. */
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

async function fetchAllPages({
  categoryId,
  listItems,
  onProgress,
  signal,
}: {
  categoryId: string;
  listItems: typeof listItemsForExport;
  onProgress?: (progress: ExportProgress) => void;
  signal?: AbortSignal;
}): Promise<{ items: ExportItem[]; photos: ExportImageRow[] }[]> {
  const pages: { items: ExportItem[]; photos: ExportImageRow[] }[] = [];
  let itemCount = 0;
  let after: ExportCursor | null = null;
  do {
    checkCancelled(signal);
    const page = await listItems({ categoryId, after, size: ITEM_PAGE_SIZE });
    if (page.error !== null) {
      throw new ExportError('Could not read items', { cause: page.error });
    }
    pages.push(page.data);
    itemCount += page.data.items.length;
    onProgress?.({ phase: 'items', done: itemCount, total: 0 });
    after = page.data.next;
  } while (after);
  return pages;
}

/** Each item's full-size paths in the order given, and the bytes they add up to. */
function photoPathsOf(photos: ExportImageRow[]): {
  photoPathsByItemId: Map<string, string[]>;
  totalBytes: number;
} {
  const photoPathsByItemId = new Map<string, string[]>();
  let totalBytes = 0;
  for (const row of photos) {
    const paths = photoPathsByItemId.get(row.item_id) ?? [];
    paths.push(row.path_full);
    photoPathsByItemId.set(row.item_id, paths);
    totalBytes += row.size_bytes ?? 0;
  }
  return { photoPathsByItemId, totalBytes };
}

/** One batch's sign call, retried while Storage's refusal is one a retry may pass. */
function signBatch({
  batch,
  signUrls,
  signal,
  jitter,
}: {
  batch: string[];
  signUrls: typeof createSignedUrls;
  signal?: AbortSignal;
  jitter: () => number;
}) {
  return retryWithBackoff({
    maxAttempts: RETRY_ATTEMPTS,
    baseMs: RETRY_BASE_MS,
    jitter,
    run: async () => {
      checkCancelled(signal);
      const result = await signUrls(batch, EXPORT_SIGNED_URL_TTL_SECONDS);
      const { error } = result;
      return {
        value: result,
        retry: !!error && isTransientStorageError(error),
      };
    },
  });
}

/** A row Storage could not sign leaves no entry behind at all. */
export async function signAll({
  paths,
  signUrls,
  signal,
  jitter = Math.random,
}: {
  paths: string[];
  signUrls: typeof createSignedUrls;
  signal?: AbortSignal;
  /** Each retry's share of its backoff; injected so a test can fix it. */
  jitter?: () => number;
}): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  await runPool({
    items: chunk(paths, SIGN_BATCH_SIZE),
    concurrency: SIGN_CONCURRENCY,
    worker: async (batch) => {
      const result = await signBatch({ batch, signUrls, signal, jitter });
      if (result.error) {
        throw new ExportError('Could not sign photograph URLs', {
          cause: result.error,
        });
      }
      for (const row of result.data) {
        if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
      }
    },
  });
  return signed;
}

function addManifestAndCsv({
  writer,
  archiveRoot,
  category,
  entries,
  exportedAt,
}: {
  writer: ZipWriter;
  archiveRoot: string;
  category: { id: string; name: string };
  entries: ExportEntry[];
  exportedAt: Date;
}): void {
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
}

/** Builds the archive; a photograph unfetchable after retrying is skipped and counted, never silent. */
export async function exportCategory({
  category,
  onProgress,
  now = () => new Date(),
  signal,
  listItems = listItemsForExport,
  signUrls = createSignedUrls,
  jitter = Math.random,
  confirmLargeExport,
}: {
  category: { id: string; name: string };
  onProgress?: (progress: ExportProgress) => void;
  now?: () => Date;
  /** Checked between phases, between batches and before every retry. */
  signal?: AbortSignal;
  listItems?: typeof listItemsForExport;
  signUrls?: typeof createSignedUrls;
  /** Each retry's share of its backoff, so pooled failures do not retry in lockstep. */
  jitter?: () => number;
  /** Asked only past `LARGE_EXPORT_WARN_BYTES`; declining cancels, omitting it skips the prompt. */
  confirmLargeExport?: (totalBytes: number) => Promise<boolean> | boolean;
}): Promise<ExportResult> {
  onProgress?.({ phase: 'items', done: 0, total: 0 });
  const pages = await fetchAllPages({
    categoryId: category.id,
    listItems,
    onProgress,
    signal,
  });
  const items = pages.flatMap((page) => page.items);

  const { photoPathsByItemId, totalBytes } = photoPathsOf(
    pages.flatMap((page) => page.photos),
  );

  if (totalBytes > LARGE_EXPORT_WARN_BYTES && confirmLargeExport) {
    checkCancelled(signal);
    const proceed = await confirmLargeExport(totalBytes);
    if (!proceed) throw new ExportCancelledError();
  }

  const entries = exportEntries(items, photoPathsByItemId);

  const storagePaths = entries.flatMap((entry) =>
    entry.photos.map((photo) => photo.storagePath),
  );
  const signed = await signAll({
    paths: storagePaths,
    signUrls,
    signal,
    jitter,
  });

  const exportedAt = now();
  const archiveRoot = archiveRootFolder(category.name, exportedAt);
  const writer = createZipWriter();
  const tasks = entries.flatMap((entry) => entry.photos);
  const total = tasks.length;
  const skipped = await downloadPhotosInto({
    writer,
    tasks,
    signed,
    archiveRoot,
    exportedAt,
    signal,
    jitter,
    onProgress,
  });

  onProgress?.({ phase: 'packing', done: total, total });
  addManifestAndCsv({ writer, archiveRoot, category, entries, exportedAt });

  return {
    blob: writer.finish(),
    filename: archiveName(category.name, exportedAt),
    itemCount: items.length,
    photoCount: total - skipped,
    skippedPhotoCount: skipped,
  };
}
