import { verifiedUserId } from './auth';
import {
  createCategory,
  deleteCategory,
  type CategorySummary,
} from './categories';
import { createItemsInCategory, type ImportedItemInsert } from './items';
import {
  createImageRow,
  removeImageObjects,
  uploadImageObject,
} from './images';
import { removeObjectsThenRows } from './imageRemoval';
import {
  findManifestPath,
  ImportFormatError,
  importPhotoTasks,
  importTimestamps,
  parseManifest,
  archivePrefixOf,
  type ImportManifest,
  type ManifestItem,
} from './importFormat';
import { checkCancelled } from './importCancellation';
import { importPhoto, realCompressThumb } from './importPhoto';
import { isPhotoStorageFull, isQuotaExceeded } from './quota';
import { ZipLimitError, ZipReadError } from './zip';
import { openZip, type ZipEntryReader } from './zipReader';
import { chunk } from '../lib/chunk';
import { runPool } from '../lib/pool';

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
  /** Photographs missing, failing, or never tried once a quota refused one: left out, not fatal. */
  skippedPhotoCount: number;
  /** The quota that refused a photograph and stopped the rest: the owner's, the app's whole storage, or none. */
  photoQuotaReached: 'none' | 'owner' | 'app';
};

class ImportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ImportError';
  }
}

/** Bounded like exportCategory's PHOTO_DOWNLOAD_CONCURRENCY, so few Blobs are in memory at once. */
export const PHOTO_UPLOAD_CONCURRENCY = 6;

/** Entries per create request, each request one transaction. */
export const ITEM_INSERT_BATCH_SIZE = 100;

type ItemToCreate = { item: ManifestItem; id: string; createdAt: string };

type ItemBatchCalls = {
  categoryId: string;
  createItemRows: typeof createItemsInCategory;
};

/** Creates one batch and its links in one transaction, so a failed batch leaves no entry outside the category. */
async function createImportedItems(
  batch: ItemToCreate[],
  { categoryId, createItemRows }: ItemBatchCalls,
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
  const { error } = await createItemRows(categoryId, rows);
  if (error) throw new ImportError('Could not create items', { cause: error });
}

/** A ZIP the reader refuses is the archive's fault: a format error, never "try again". */
function asFormatError(error: unknown): unknown {
  if (error instanceof ZipLimitError) {
    return new ImportFormatError('too_large', error.message, { cause: error });
  }
  if (error instanceof ZipReadError) {
    return new ImportFormatError('unreadable', error.message, { cause: error });
  }
  return error;
}

async function readManifest(read: ZipEntryReader): Promise<ImportManifest> {
  let text: string;
  try {
    text = await (await read()).text();
  } catch (error) {
    throw asFormatError(error);
  }
  try {
    return parseManifest(JSON.parse(text));
  } catch (error) {
    if (error instanceof ImportFormatError) throw error;
    throw new ImportFormatError(
      'not_export',
      'Could not read collection.json in this archive',
      { cause: error },
    );
  }
}

/** Imports an archive as a new category; `nameCategory` turns the archived name into one trusted as unique. */
export async function importCategory({
  file,
  nameCategory,
  onProgress,
  signal,
  getUid = verifiedUserId,
  createCategoryRow = createCategory,
  deleteCategoryRow = deleteCategory,
  createItemRows = createItemsInCategory,
  newItemId = () => crypto.randomUUID(),
  now = () => new Date(),
  uploadImage = uploadImageObject,
  removeImages = removeImageObjects,
  createImage = createImageRow,
  compressThumb = realCompressThumb,
}: {
  file: Blob;
  nameCategory: (archivedName: string) => string;
  onProgress?: (progress: ImportProgress) => void;
  /** Checked between phases, between items and before every retry. */
  signal?: AbortSignal;
  getUid?: () => Promise<string | null>;
  createCategoryRow?: typeof createCategory;
  deleteCategoryRow?: typeof deleteCategory;
  createItemRows?: typeof createItemsInCategory;
  newItemId?: () => string;
  now?: () => Date;
  uploadImage?: typeof uploadImageObject;
  removeImages?: typeof removeImageObjects;
  createImage?: typeof createImageRow;
  compressThumb?: (photo: Blob) => Promise<Blob>;
}): Promise<ImportResult> {
  onProgress?.({ phase: 'reading', done: 0, total: 0 });
  checkCancelled(signal);

  const uid = await getUid();
  if (!uid) throw new ImportError('No user session');

  let entries: Map<string, ZipEntryReader>;
  try {
    entries = await openZip(file);
  } catch (error) {
    throw asFormatError(error);
  }

  const manifestPath = findManifestPath(entries.keys());
  // Non-null: findManifestPath only returns a key it read out of `entries` itself.
  const manifest = await readManifest(entries.get(manifestPath)!);
  const manifestItems = manifest.items;
  const archivedName = manifest.category.name;

  checkCancelled(signal);
  const prefix = archivePrefixOf(manifestPath);
  const { data: category, error: categoryError } = await createCategoryRow(
    nameCategory(archivedName),
  );
  if (categoryError || !category) {
    throw new ImportError('Could not create category', {
      cause: categoryError,
    });
  }

  // Every path an upload was tried at: a request that failed may still have stored its object.
  const attemptedPaths = new Set<string>();
  const recordingUpload: typeof uploadImageObject = (path, blob) => {
    attemptedPaths.add(path);
    return uploadImage(path, blob);
  };

  // A failure past this point deletes the half-built category; a failed cleanup is only logged.
  try {
    onProgress?.({ phase: 'items', done: 0, total: manifestItems.length });
    const importedAt = now();
    const createdAts = importTimestamps(manifestItems.length, importedAt);
    const toCreate = manifestItems.map((item, i) => ({
      item,
      id: newItemId(),
      createdAt: createdAts[i],
    }));
    const calls = { categoryId: category.id, createItemRows };
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
    const photoTasks = importPhotoTasks(toCreate, importedAt);

    const total = photoTasks.length;
    let done = 0;
    let photoCount = 0;
    let photoQuotaReached: ImportResult['photoQuotaReached'] = 'none';
    onProgress?.({ phase: 'photos', done, total });

    try {
      await runPool({
        items: photoTasks,
        concurrency: PHOTO_UPLOAD_CONCURRENCY,
        worker: async (task) => {
          checkCancelled(signal);
          const imported = await importPhoto({
            task,
            readPhoto: entries.get(`${prefix}${task.archivePath}`),
            uid,
            calls: {
              uploadImage: recordingUpload,
              createImage,
              compressThumb,
              signal,
            },
          });
          if (imported) photoCount++;
          onProgress?.({ phase: 'photos', done: ++done, total });
        },
      });
    } catch (error) {
      // runPool stopped handing out photographs; those already recorded stay, as a partial import.
      if (!isQuotaExceeded(error)) throw error;
      photoQuotaReached = isPhotoStorageFull(error) ? 'app' : 'owner';
    }

    return {
      category,
      itemCount: manifestItems.length,
      photoCount,
      skippedPhotoCount: total - photoCount,
      photoQuotaReached,
    };
  } catch (error) {
    // runPool settles in-flight uploads before rethrowing, so no object lands after this.
    const { error: cleanupError } = await removeObjectsThenRows({
      paths: [...attemptedPaths],
      deleteRows: () => deleteCategoryRow(category.id),
      removeObjects: removeImages,
    });
    if (cleanupError) {
      console.error(
        'Could not clean up partially-imported category',
        category.id,
        cleanupError,
      );
    }
    throw asFormatError(error);
  }
}
