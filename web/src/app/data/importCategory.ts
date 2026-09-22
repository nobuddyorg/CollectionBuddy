/**
 * Building one category from an archive `exportCategory` produced.
 *
 * No server here either: the whole import runs in the tab, unzipping,
 * recreating the category and its items over PostgREST, and re-uploading
 * each photograph. The raw calls are accepted as parameters, the same way
 * exportCategory.ts's are, so importCategory.test.ts can drive this with
 * fakes.
 *
 * Always creates a *new* category, never merges into an existing one:
 * `manifest.items[].id` is kept in the archive for a future import to use
 * as merge identity, but nothing reads it that way yet. Importing the same
 * archive twice makes two categories, not a merge.
 */

import { verifiedUserId } from './auth';
import {
  createCategory,
  deleteCategory,
  type CategorySummary,
} from './categories';
import {
  createItems,
  deleteItems,
  linkItemsToCategory,
  type ImportedItemInsert,
} from './items';
import { createImageRow, imagePrefix, uploadImageObject } from './images';
import {
  findManifestPath,
  ImportFormatError,
  importTimestamps,
  parseManifest,
  rootFolderOf,
} from './importFormat';
import { readZipEntries } from './zip';
import { chunk } from '../lib/chunk';
import { runPool } from '../lib/pool';
import { attempts, backoffDelayMs } from '../lib/backoff';
import { WEBP_COMPRESSION_OPTIONS } from '../lib/imageCompression';

export type ImportProgress = {
  phase: 'reading' | 'items' | 'photos';
  done: number;
  total: number;
};

export type ImportResult = {
  category: CategorySummary;
  itemCount: number;
  /** Photographs actually written to storage -- not photographs attempted. */
  photoCount: number;
  /** Photographs present in the manifest but missing from the archive, or
   * that could not be uploaded after retrying -- left out, not fatal. */
  skippedPhotoCount: number;
};

class ImportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ImportError';
  }
}

/** Thrown when the caller's `signal` is aborted -- a user-requested cancel,
 * not a failure -- so the UI can report it differently from one. */
export class ImportCancelledError extends Error {
  constructor() {
    super('Import cancelled');
    this.name = 'ImportCancelledError';
  }
}

function checkCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ImportCancelledError();
}

/** Bounded, like exportCategory.ts's PHOTO_DOWNLOAD_CONCURRENCY, so only a
 * handful of Blobs are held in memory at once. */
export const PHOTO_UPLOAD_CONCURRENCY = 6;

/** Items per insert request; also the id count of a cleanup's `.in()` filter,
 * kept at the URL-length-safe size the data layer uses everywhere else. */
export const ITEM_INSERT_BATCH_SIZE = 100;

const PHOTO_UPLOAD_ATTEMPTS = 3;
const PHOTO_UPLOAD_RETRY_BASE_MS = 500;

/**
 * Regenerates the 600px thumbnail from a photograph's full-size bytes: the
 * archive only ever carries the full size (thumbnails are the app's own
 * derivative, left out of the export), so importing must make a new one the
 * same way `useItemImages.tsx`'s upload path does, from the already-sized
 * image rather than some larger original that no longer exists.
 */
async function realCompressThumb(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Blob> {
  const { default: imageCompression } =
    await import('browser-image-compression');
  const file = new File([bytes], 'photo.webp', { type: 'image/webp' });
  return imageCompression(file, {
    maxWidthOrHeight: 600,
    ...WEBP_COMPRESSION_OPTIONS,
  });
}

/** Storage doesn't reliably attach a status the way a `fetch` response does,
 * so (unlike the export's download retry) every failure here is treated as
 * retryable rather than distinguishing permanent from transient. */
async function uploadWithRetry(
  path: string,
  blob: Blob,
  uploadImage: typeof uploadImageObject,
  signal?: AbortSignal,
): Promise<unknown> {
  let lastErr: unknown;
  for (const attempt of attempts(PHOTO_UPLOAD_ATTEMPTS)) {
    checkCancelled(signal);
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          backoffDelayMs(PHOTO_UPLOAD_RETRY_BASE_MS, attempt - 1),
        ),
      );
    }
    const { error } = await uploadImage(path, blob);
    if (!error) return null;
    lastErr = error;
  }
  return lastErr;
}

type PhotoTask = { itemId: string; archivePath: string };

/** The raw calls one photograph's round trip makes, threaded through from
 * importCategory's own parameters so a test drives both with one set of
 * fakes. */
type PhotoImportCalls = {
  uploadImage: typeof uploadImageObject;
  createImage: typeof createImageRow;
  compressThumb: (bytes: Uint8Array<ArrayBuffer>) => Promise<Blob>;
  signal?: AbortSignal;
};

type ManifestItem = {
  title: string;
  description: string | null;
  place: string | null;
  place_lat: number | null;
  place_lng: number | null;
  tags: string[];
  photos: string[];
};

type ItemToCreate = { item: ManifestItem; id: string; createdAt: string };

type ItemBatchCalls = {
  categoryId: string;
  createItemRows: typeof createItems;
  linkItemRows: typeof linkItemsToCategory;
  deleteItemRows: typeof deleteItems;
};

/**
 * Recreates one batch of manifest items, linked to `categoryId`, in two
 * requests. A batch whose links fail is deleted again (best effort), since
 * the category's cleanup cascade only reaches linked items.
 */
async function createImportedItems(
  batch: ItemToCreate[],
  { categoryId, createItemRows, linkItemRows, deleteItemRows }: ItemBatchCalls,
): Promise<void> {
  const rows: ImportedItemInsert[] = batch.map(({ item, id, createdAt }) => ({
    id,
    created_at: createdAt,
    title: item.title,
    description: item.description,
    place: item.place,
    place_lat: item.place_lat,
    place_lng: item.place_lng,
    tags: item.tags,
  }));
  const { error } = await createItemRows(rows);
  if (error) throw new ImportError('Could not create items', { cause: error });

  const { error: linkError } = await linkItemRows(
    batch.map(({ id, createdAt }) => ({
      item_id: id,
      category_id: categoryId,
      created_at: createdAt,
    })),
  );
  if (!linkError) return;
  const { error: cleanupError } = await deleteItemRows(batch.map((b) => b.id));
  if (cleanupError) {
    console.error('Could not clean up unlinked items', cleanupError);
  }
  throw new ImportError('Could not link items to category', {
    cause: linkError,
  });
}

/**
 * Recreates one archived photograph: the full size as it came out of the
 * archive, a freshly derived thumbnail, and the `images` row naming both.
 * A thumbnail failing on its own is not a failure -- `path_thumb` goes null
 * and the photograph stands, as in the app's own upload path.
 *
 * Returns false for a photograph left out (missing from the archive, or
 * still failing after `uploadWithRetry`'s attempts), which is reported and
 * skipped rather than failing the import. Cancellation is the one error
 * that propagates.
 */
async function importPhoto(
  task: PhotoTask,
  bytes: Uint8Array<ArrayBuffer> | undefined,
  uid: string,
  { uploadImage, createImage, compressThumb, signal }: PhotoImportCalls,
): Promise<boolean> {
  if (!bytes) {
    console.error('Photo missing from archive', task.archivePath);
    return false;
  }
  try {
    const thumb = await compressThumb(bytes);
    const base = crypto.randomUUID();
    const pathBase = `${imagePrefix(uid, task.itemId)}/${base}`;
    const fullError = await uploadWithRetry(
      `${pathBase}.webp`,
      new Blob([bytes], { type: 'image/webp' }),
      uploadImage,
      signal,
    );
    if (fullError) {
      throw new Error('Could not upload photograph', { cause: fullError });
    }
    const thumbError = await uploadWithRetry(
      `${pathBase}.thumb.webp`,
      thumb,
      uploadImage,
      signal,
    );
    if (thumbError) {
      console.warn('Thumbnail upload failed:', thumbError);
    }

    const { error: rowError } = await createImage({
      item_id: task.itemId,
      path_full: `${pathBase}.webp`,
      path_thumb: thumbError ? null : `${pathBase}.thumb.webp`,
      size_bytes: bytes.length,
    });
    if (rowError) {
      throw new Error('Could not record photograph', { cause: rowError });
    }
    return true;
  } catch (err) {
    if (err instanceof ImportCancelledError) throw err;
    console.error('Skipping photograph', task.archivePath, err);
    return false;
  }
}

/**
 * Imports one category from a previously exported archive.
 *
 * `categoryName` is trusted as already unique (see `uniqueCategoryName` in
 * `./categories`) -- resolving a collision is a UI concern (what to call the
 * second import of the same archive), not this function's.
 */
export async function importCategory({
  file,
  categoryName,
  onProgress,
  signal,
  // The raw calls this file makes: real by default, faked in tests.
  getUid = verifiedUserId,
  readZip = readZipEntries,
  createCategoryRow = createCategory,
  deleteCategoryRow = deleteCategory,
  createItemRows = createItems,
  linkItemRows = linkItemsToCategory,
  deleteItemRows = deleteItems,
  newItemId = () => crypto.randomUUID(),
  now = () => new Date(),
  uploadImage = uploadImageObject,
  createImage = createImageRow,
  compressThumb = realCompressThumb,
}: {
  file: Blob;
  categoryName: string;
  onProgress?: (progress: ImportProgress) => void;
  /** Aborted to cancel a run in progress -- checked the same places
   * exportCategory.ts's signal is: between phases, between items, before
   * every retry. */
  signal?: AbortSignal;
  getUid?: () => Promise<string | null>;
  readZip?: typeof readZipEntries;
  createCategoryRow?: typeof createCategory;
  deleteCategoryRow?: typeof deleteCategory;
  createItemRows?: typeof createItems;
  linkItemRows?: typeof linkItemsToCategory;
  deleteItemRows?: typeof deleteItems;
  newItemId?: () => string;
  now?: () => Date;
  uploadImage?: typeof uploadImageObject;
  createImage?: typeof createImageRow;
  compressThumb?: (bytes: Uint8Array<ArrayBuffer>) => Promise<Blob>;
}): Promise<ImportResult> {
  onProgress?.({ phase: 'reading', done: 0, total: 0 });
  checkCancelled(signal);

  const uid = await getUid();
  if (!uid) throw new ImportError('No user session');

  let entries: Map<string, Uint8Array<ArrayBuffer>>;
  try {
    entries = await readZip(file);
  } catch (err) {
    throw new ImportError('Could not read this file as a ZIP archive', {
      cause: err,
    });
  }

  const manifestPath = findManifestPath(entries.keys());
  if (!manifestPath) {
    throw new ImportFormatError('Not a CollectionBuddy export archive');
  }
  // Non-null because findManifestPath only ever returns a name it read out
  // of `entries` itself -- the Map cannot disagree with its own keys.
  const manifestBytes = entries.get(manifestPath)!;

  let manifestItems: ManifestItem[];
  try {
    const json: unknown = JSON.parse(new TextDecoder().decode(manifestBytes));
    manifestItems = parseManifest(json).items;
  } catch (err) {
    if (err instanceof ImportFormatError) throw err;
    throw new ImportFormatError(
      'Could not read collection.json in this archive',
    );
  }

  checkCancelled(signal);
  const root = rootFolderOf(manifestPath);
  const { data: category, error: categoryError } =
    await createCategoryRow(categoryName);
  if (categoryError || !category) {
    throw new ImportError('Could not create category', {
      cause: categoryError,
    });
  }

  // Anything that fails from here on leaves a new, empty-ish category
  // behind rather than a fully usable one -- worse than not having started,
  // since it looks like a real (if broken) collection. Best-effort cleanup
  // rather than leaving that behind for someone to notice and delete by
  // hand; the cleanup's own failure is logged, not thrown, since the
  // original error is the one worth reporting.
  try {
    onProgress?.({ phase: 'items', done: 0, total: manifestItems.length });
    const createdAts = importTimestamps(manifestItems.length, now());
    const toCreate = manifestItems.map((item, i) => ({
      item,
      id: newItemId(),
      createdAt: createdAts[i],
    }));
    const calls = {
      categoryId: category.id,
      createItemRows,
      linkItemRows,
      deleteItemRows,
    };
    let itemsDone = 0;
    for (const batch of chunk(toCreate, ITEM_INSERT_BATCH_SIZE)) {
      checkCancelled(signal);
      await createImportedItems(batch, calls);
      itemsDone += batch.length;
      onProgress?.({
        phase: 'items',
        done: itemsDone,
        total: manifestItems.length,
      });
    }
    const photoTasks: PhotoTask[] = toCreate.flatMap(({ item, id }) =>
      item.photos.map((archivePath) => ({ itemId: id, archivePath })),
    );

    const total = photoTasks.length;
    let done = 0;
    let photoCount = 0;
    let skippedPhotoCount = 0;
    onProgress?.({ phase: 'photos', done, total });

    await runPool(photoTasks, PHOTO_UPLOAD_CONCURRENCY, async (task) => {
      checkCancelled(signal);
      const imported = await importPhoto(
        task,
        entries.get(`${root}/${task.archivePath}`),
        uid,
        { uploadImage, createImage, compressThumb, signal },
      );
      if (imported) photoCount++;
      else skippedPhotoCount++;
      onProgress?.({ phase: 'photos', done: ++done, total });
    });

    return {
      category,
      itemCount: manifestItems.length,
      photoCount,
      skippedPhotoCount,
    };
  } catch (err) {
    const { error: cleanupError } = await deleteCategoryRow(category.id);
    if (cleanupError) {
      console.error(
        'Could not clean up partially-imported category',
        category.id,
        cleanupError,
      );
    }
    throw err;
  }
}
