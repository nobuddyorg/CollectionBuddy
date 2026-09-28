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
  type PhotoTask,
} from './importFormat';
import { checkCancelled } from './importCancellation';
import {
  importPhoto,
  realCompressThumb,
  type PhotoImportCalls,
} from './importPhoto';
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

/** Bounded like the export's PHOTO_DOWNLOAD_CONCURRENCY, so few Blobs are in memory at once. */
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

async function openArchive(file: Blob): Promise<{
  entries: Map<string, ZipEntryReader>;
  prefix: string;
  manifest: ImportManifest;
}> {
  let entries: Map<string, ZipEntryReader>;
  try {
    entries = await openZip(file);
  } catch (error) {
    throw asFormatError(error);
  }
  const manifestPath = findManifestPath(entries.keys());
  // Non-null: findManifestPath only returns a key it read out of `entries` itself.
  const manifest = await readManifest(entries.get(manifestPath)!);
  return { entries, prefix: archivePrefixOf(manifestPath), manifest };
}

type OnProgress = (progress: ImportProgress) => void;

async function createAllItems({
  toCreate,
  calls,
  signal,
  onProgress,
}: {
  toCreate: ItemToCreate[];
  calls: ItemBatchCalls;
  signal?: AbortSignal;
  onProgress?: OnProgress;
}): Promise<void> {
  let done = 0;
  for (const batch of chunk(toCreate, ITEM_INSERT_BATCH_SIZE)) {
    checkCancelled(signal);
    await createImportedItems(batch, calls);
    done += batch.length;
    onProgress?.({ phase: 'items', done, total: toCreate.length });
  }
}

async function importAllPhotos({
  photoTasks,
  entries,
  prefix,
  userId,
  calls,
  onProgress,
}: {
  photoTasks: PhotoTask[];
  entries: Map<string, ZipEntryReader>;
  prefix: string;
  userId: string;
  calls: PhotoImportCalls;
  onProgress?: OnProgress;
}): Promise<Pick<ImportResult, 'photoCount' | 'photoQuotaReached'>> {
  const total = photoTasks.length;
  let done = 0;
  let photoCount = 0;
  onProgress?.({ phase: 'photos', done, total });
  try {
    await runPool({
      items: photoTasks,
      concurrency: PHOTO_UPLOAD_CONCURRENCY,
      worker: async (task) => {
        checkCancelled(calls.signal);
        const imported = await importPhoto({
          task,
          readPhoto: entries.get(`${prefix}${task.archivePath}`),
          userId,
          calls,
        });
        if (imported) photoCount++;
        onProgress?.({ phase: 'photos', done: ++done, total });
      },
    });
  } catch (error) {
    // runPool stopped handing out photographs; those already recorded stay, as a partial import.
    if (!isQuotaExceeded(error)) throw error;
    const photoQuotaReached = isPhotoStorageFull(error) ? 'app' : 'owner';
    return { photoCount, photoQuotaReached };
  }
  return { photoCount, photoQuotaReached: 'none' };
}

async function discardPartialImport({
  categoryId,
  attemptedPaths,
  deleteCategoryRow,
  removeImages,
}: {
  categoryId: string;
  attemptedPaths: ReadonlySet<string>;
  deleteCategoryRow: typeof deleteCategory;
  removeImages: typeof removeImageObjects;
}): Promise<void> {
  // runPool settles in-flight uploads before rethrowing, so no object lands after this.
  const { error } = await removeObjectsThenRows({
    paths: [...attemptedPaths],
    deleteRows: () => deleteCategoryRow(categoryId),
    removeObjects: removeImages,
  });
  if (error) {
    console.error(
      'Could not clean up partially-imported category',
      categoryId,
      error,
    );
  }
}

/** Imports an archive as a new category; `nameCategory` turns the archived name into one trusted as unique. */
export async function importCategory({
  file,
  nameCategory,
  onProgress,
  signal,
  getUserId = verifiedUserId,
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
  onProgress?: OnProgress;
  /** Checked between phases, between items and before every retry. */
  signal?: AbortSignal;
  getUserId?: () => Promise<string | null>;
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

  const userId = await getUserId();
  if (!userId) throw new ImportError('No user session');

  const { entries, prefix, manifest } = await openArchive(file);

  checkCancelled(signal);
  const { data: category, error: categoryError } = await createCategoryRow(
    nameCategory(manifest.category.name),
  );
  if (categoryError) {
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
    const itemCount = manifest.items.length;
    onProgress?.({ phase: 'items', done: 0, total: itemCount });
    const importedAt = now();
    const createdAts = importTimestamps(itemCount, importedAt);
    const toCreate = manifest.items.map((item, i) => ({
      item,
      id: newItemId(),
      createdAt: createdAts[i],
    }));
    await createAllItems({
      toCreate,
      calls: { categoryId: category.id, createItemRows },
      signal,
      onProgress,
    });
    const photoTasks = importPhotoTasks(toCreate, importedAt);
    const { photoCount, photoQuotaReached } = await importAllPhotos({
      photoTasks,
      entries,
      prefix,
      userId,
      calls: {
        uploadImage: recordingUpload,
        createImage,
        compressThumb,
        signal,
      },
      onProgress,
    });
    return {
      category,
      itemCount,
      photoCount,
      skippedPhotoCount: photoTasks.length - photoCount,
      photoQuotaReached,
    };
  } catch (error) {
    await discardPartialImport({
      categoryId: category.id,
      attemptedPaths,
      deleteCategoryRow,
      removeImages,
    });
    throw asFormatError(error);
  }
}
