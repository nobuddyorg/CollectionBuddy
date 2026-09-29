import { ITEM_IMAGES_BUCKET } from './images';
import { checkCancelled, ExportCancelledError } from './exportCancellation';
import type { ExportEntry } from './exportFormat';
import { ZipLimitError, type ZipWriter } from './zip';
import { runPool } from '../lib/pool';
import { isRetryableStatus, retryWithBackoff } from '../lib/backoff';

// A sign call and a photo download each get three attempts; PostgREST reads are retried by postgrest-js itself.
export const RETRY_ATTEMPTS = 3;
export const RETRY_BASE_MS = 500;

/** Bounded so only a handful of response Blobs are ever held in memory at once. */
export const PHOTO_DOWNLOAD_CONCURRENCY = 6;

/** Browser `fetch` has no response timeout of its own, so a stalled response would hang forever. */
export const PHOTO_FETCH_TIMEOUT_MS = 30_000;

function fetchSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(PHOTO_FETCH_TIMEOUT_MS);
  return signal ? AbortSignal.any([timeout, signal]) : timeout;
}

async function fetchPhotoBytes({
  url,
  signal,
  jitter,
}: {
  url: string;
  signal?: AbortSignal;
  jitter: () => number;
}): Promise<Uint8Array<ArrayBuffer>> {
  const outcome = await retryWithBackoff<
    { bytes: Uint8Array<ArrayBuffer> } | { error: unknown }
  >({
    maxAttempts: RETRY_ATTEMPTS,
    baseMs: RETRY_BASE_MS,
    jitter,
    run: async () => {
      checkCancelled(signal);
      try {
        const response = await fetch(url, { signal: fetchSignal(signal) });
        if (response.ok) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          return { value: { bytes }, retry: false };
        }
        // A 404 is a 404 three times over.
        const error = new Error(`HTTP ${response.status}`);
        return { value: { error }, retry: isRetryableStatus(response.status) };
      } catch (error) {
        // A cancel and a per-attempt timeout both abort the fetch; only the caller's signal stops.
        checkCancelled(signal);
        return { value: { error }, retry: true };
      }
    },
  });
  if ('error' in outcome) throw outcome.error;
  return outcome.bytes;
}

/** Resolves to how many photographs could not be fetched after retrying and were left out. */
export async function downloadPhotosInto({
  writer,
  tasks,
  signed,
  archiveRoot,
  exportedAt,
  signal,
  jitter,
  onProgress,
}: {
  writer: ZipWriter;
  tasks: ExportEntry['photos'];
  signed: Map<string, string>;
  archiveRoot: string;
  exportedAt: Date;
  signal?: AbortSignal;
  jitter: () => number;
  onProgress?: (progress: {
    phase: 'photos';
    done: number;
    total: number;
  }) => void;
}): Promise<number> {
  let done = 0;
  let skipped = 0;
  const total = tasks.length;
  onProgress?.({ phase: 'photos', done, total });

  // A ZipLimitError or a cancellation fails the whole export, not one more skipped photograph.
  await runPool({
    items: tasks,
    concurrency: PHOTO_DOWNLOAD_CONCURRENCY,
    worker: async (task) => {
      checkCancelled(signal);
      const url = signed.get(task.storagePath);
      try {
        if (!url) throw new Error(`Unsigned path in ${ITEM_IMAGES_BUCKET}`);
        const bytes = await fetchPhotoBytes({ url, signal, jitter });
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
    },
  });
  return skipped;
}
