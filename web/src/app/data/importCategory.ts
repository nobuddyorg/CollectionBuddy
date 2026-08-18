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
  createItem,
  linkItemToCategory,
  type ItemEditableFieldKey,
  type ItemInsert,
} from './items';
import { createImageRow, imagePrefix, uploadImageObject } from './images';
import {
  findManifestPath,
  ImportFormatError,
  parseManifest,
  rootFolderOf,
} from './importFormat';
import { readZipEntries } from './zip';
import { runPool } from './exportCategory';

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

export class ImportError extends Error {
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

const PHOTO_UPLOAD_ATTEMPTS = 3;
const PHOTO_UPLOAD_RETRY_BASE_MS = 500;

/**
 * Regenerates the 600px thumbnail from a photograph's full-size bytes: the
 * archive only ever carries the full size (thumbnails are the app's own
 * derivative, left out of the export), so importing must make a new one the
 * same way `useItemImages.tsx`'s upload path does, from the already-sized
 * image rather than some larger original that no longer exists.
 */
// Stryker disable all
/* v8 ignore start -- the real browser call; every test injects a fake. */
async function realCompressThumb(
  bytes: Uint8Array<ArrayBuffer>,
): Promise<Blob> {
  const { default: imageCompression } =
    await import('browser-image-compression');
  const file = new File([bytes], 'photo.webp', { type: 'image/webp' });
  return imageCompression(file, {
    maxWidthOrHeight: 600,
    initialQuality: 0.8,
    fileType: 'image/webp',
    useWebWorker: true,
  });
}
/* v8 ignore stop */
// Stryker restore all

/** Storage doesn't reliably attach a status the way a `fetch` response does,
 * so (unlike the export's download retry) every failure here is treated as
 * retryable rather than distinguishing permanent from transient. */
async function uploadWithRetry(
  path: string,
  blob: Blob,
  uploadImage: typeof uploadImageObject,
  signal?: AbortSignal,
): Promise<{ error: unknown }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < PHOTO_UPLOAD_ATTEMPTS; attempt++) {
    checkCancelled(signal);
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, PHOTO_UPLOAD_RETRY_BASE_MS * 2 ** (attempt - 1)),
      );
    }
    const { error } = await uploadImage(path, blob);
    if (!error) return { error: null };
    lastErr = error;
  }
  return { error: lastErr };
}

type ManifestItem = {
  title: string;
  description: string | null;
  place: string | null;
  place_lat: number | null;
  place_lng: number | null;
  tags: string[];
  photos: string[];
};

/**
 * Recreates one manifest item's row, linked to `categoryId`. Returns its new
 * id so the photo-upload phase knows which item's storage prefix to write
 * under.
 */
async function createImportedItem(
  item: ManifestItem,
  categoryId: string,
  createItemRow: typeof createItem,
  linkItemToCategoryRow: typeof linkItemToCategory,
): Promise<string> {
  const payload: Pick<ItemInsert, ItemEditableFieldKey> = {
    title: item.title,
    description: item.description,
    place: item.place,
    place_lat: item.place_lat,
    place_lng: item.place_lng,
    tags: item.tags,
  };
  const { data, error } = await createItemRow(payload);
  if (error || !data) {
    throw new ImportError('Could not create item', { cause: error });
  }
  const { error: linkError } = await linkItemToCategoryRow(data.id, categoryId);
  if (linkError) {
    throw new ImportError('Could not link item to category', {
      cause: linkError,
    });
  }
  return data.id;
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
  createItemRow = createItem,
  linkItemToCategoryRow = linkItemToCategory,
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
  createItemRow?: typeof createItem;
  linkItemToCategoryRow?: typeof linkItemToCategory;
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
  const manifestBytes = entries.get(manifestPath);
  // findManifestPath only ever returns a name it read out of `entries`
  // itself, so this can't actually be null -- guarded only to satisfy the
  // type checker, not because the Map is expected to disagree with its own
  // keys.
  // v8 ignore next
  if (!manifestBytes) throw new ImportFormatError('Archive is corrupt');

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
    const photoTasks: { itemId: string; archivePath: string }[] = [];
    let itemsDone = 0;
    for (const item of manifestItems) {
      checkCancelled(signal);
      const itemId = await createImportedItem(
        item,
        category.id,
        createItemRow,
        linkItemToCategoryRow,
      );
      for (const archivePath of item.photos) {
        photoTasks.push({ itemId, archivePath });
      }
      itemsDone++;
      onProgress?.({
        phase: 'items',
        done: itemsDone,
        total: manifestItems.length,
      });
    }

    const total = photoTasks.length;
    let done = 0;
    let photoCount = 0;
    let skippedPhotoCount = 0;
    onProgress?.({ phase: 'photos', done, total });

    await runPool(photoTasks, PHOTO_UPLOAD_CONCURRENCY, async (task) => {
      checkCancelled(signal);
      const bytes = entries.get(`${root}/${task.archivePath}`);
      if (!bytes) {
        console.error('Photo missing from archive', task.archivePath);
        skippedPhotoCount++;
        onProgress?.({ phase: 'photos', done: ++done, total });
        return;
      }
      try {
        const thumb = await compressThumb(bytes);
        const base = crypto.randomUUID();
        const pathBase = `${imagePrefix(uid, task.itemId)}/${base}`;
        const { error: fullError } = await uploadWithRetry(
          `${pathBase}.webp`,
          new Blob([bytes], { type: 'image/webp' }),
          uploadImage,
          signal,
        );
        if (fullError) {
          throw new Error('Could not upload photograph', {
            cause: fullError,
          });
        }
        const { error: thumbError } = await uploadWithRetry(
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
        photoCount++;
      } catch (err) {
        if (err instanceof ImportCancelledError) throw err;
        console.error('Skipping photograph', task.archivePath, err);
        skippedPhotoCount++;
      }
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
