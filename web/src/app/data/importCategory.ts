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
  rootFolderOf,
} from './importFormat';
import { checkCancelled } from './importCancellation';
import { importPhoto, realCompressThumb } from './importPhoto';
import { readZipEntries } from './zip';
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
  /** Photographs missing from the archive or failing every upload retry: left out, not fatal. */
  skippedPhotoCount: number;
};

class ImportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ImportError';
  }
}

/** Bounded like exportCategory's PHOTO_DOWNLOAD_CONCURRENCY, so few Blobs are in memory at once. */
export const PHOTO_UPLOAD_CONCURRENCY = 6;

/** Items per insert request, and the id count of a cleanup's URL-length-safe `.in()` filter. */
export const ITEM_INSERT_BATCH_SIZE = 100;

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

/** Creates and links one batch; a batch whose links fail is deleted, being outside the cascade. */
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
  const { error: cleanupError } = await deleteItemRows(
    batch.map(({ id }) => id),
  );
  if (cleanupError) {
    console.error('Could not clean up unlinked items', cleanupError);
  }
  throw new ImportError('Could not link items to category', {
    cause: linkError,
  });
}

/** Imports an archive as a new category; `categoryName` is trusted as already unique. */
export async function importCategory({
  file,
  categoryName,
  onProgress,
  signal,
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
  removeImages = removeImageObjects,
  createImage = createImageRow,
  compressThumb = realCompressThumb,
}: {
  file: Blob;
  categoryName: string;
  onProgress?: (progress: ImportProgress) => void;
  /** Checked between phases, between items and before every retry. */
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
  removeImages?: typeof removeImageObjects;
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
  } catch (error) {
    throw new ImportError('Could not read this file as a ZIP archive', {
      cause: error,
    });
  }

  const manifestPath = findManifestPath(entries.keys());
  if (!manifestPath) {
    throw new ImportFormatError('Not a CollectionBuddy export archive');
  }
  // Non-null: findManifestPath only returns a key it read out of `entries` itself.
  const manifestBytes = entries.get(manifestPath)!;

  let manifestItems: ManifestItem[];
  try {
    const json: unknown = JSON.parse(new TextDecoder().decode(manifestBytes));
    manifestItems = parseManifest(json).items;
  } catch (error) {
    if (error instanceof ImportFormatError) throw error;
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
    const photoTasks = importPhotoTasks(toCreate, importedAt);

    const total = photoTasks.length;
    let done = 0;
    let photoCount = 0;
    let skippedPhotoCount = 0;
    onProgress?.({ phase: 'photos', done, total });

    await runPool({
      items: photoTasks,
      concurrency: PHOTO_UPLOAD_CONCURRENCY,
      worker: async (task) => {
        checkCancelled(signal);
        const imported = await importPhoto({
          task,
          bytes: entries.get(`${root}/${task.archivePath}`),
          uid,
          calls: {
            uploadImage: recordingUpload,
            createImage,
            compressThumb,
            signal,
          },
        });
        if (imported) photoCount++;
        else skippedPhotoCount++;
        onProgress?.({ phase: 'photos', done: ++done, total });
      },
    });

    return {
      category,
      itemCount: manifestItems.length,
      photoCount,
      skippedPhotoCount,
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
    throw error;
  }
}
