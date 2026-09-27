import {
  createImageRow,
  imagePrefix,
  isTransientStorageError,
  uploadImageObject,
} from './images';
import { checkCancelled, ImportCancelledError } from './importCancellation';
import { isQuotaExceeded } from './quota';
import { retryWithBackoff } from '../lib/backoff';
import { compressPhoto } from '../lib/imageCompression';
import { extensionForType, typeForArchivePath } from './photoType';
import type { PhotoTask } from './importFormat';
import { ZipReadError } from './zip';
import type { ZipEntryReader } from './zipReader';

const PHOTO_UPLOAD_ATTEMPTS = 3;
const PHOTO_UPLOAD_RETRY_BASE_MS = 500;

/** The archive carries only the full size, so the 600px thumbnail is remade the way uploads do. */
export function realCompressThumb(photo: Blob): Promise<Blob> {
  return compressPhoto(
    new File([photo], 'photo.webp', { type: 'image/webp' }),
    600,
  );
}

/** Retries only what `isTransientStorageError` says may pass; a 403, 409 or 413 is returned at once. */
async function uploadWithRetry({
  path,
  blob,
  uploadImage,
  signal,
}: {
  path: string;
  blob: Blob;
  uploadImage: typeof uploadImageObject;
  signal?: AbortSignal;
}): Promise<unknown> {
  return retryWithBackoff({
    maxAttempts: PHOTO_UPLOAD_ATTEMPTS,
    baseMs: PHOTO_UPLOAD_RETRY_BASE_MS,
    run: async () => {
      checkCancelled(signal);
      const { error } = await uploadImage(path, blob);
      return {
        value: error,
        retry: error !== null && isTransientStorageError(error),
      };
    },
  });
}

/** The raw calls one photograph's round trip makes, threaded through from `importCategory`. */
export type PhotoImportCalls = {
  uploadImage: typeof uploadImageObject;
  createImage: typeof createImageRow;
  compressThumb: (photo: Blob) => Promise<Blob>;
  signal?: AbortSignal;
};

/** False for a photograph left out (missing, or failing after retrying); a cancel, a quota refusal or a damaged archive propagates. */
export async function importPhoto({
  task,
  readPhoto,
  uid,
  calls: { uploadImage, createImage, compressThumb, signal },
}: {
  task: PhotoTask;
  readPhoto: ZipEntryReader | undefined;
  uid: string;
  calls: PhotoImportCalls;
}): Promise<boolean> {
  if (!readPhoto) {
    console.error('Photo missing from archive', task.archivePath);
    return false;
  }
  try {
    // Stored as the export named it, so a round trip keeps each photograph's own type.
    const fullType = typeForArchivePath(task.archivePath);
    // Read only now, one photograph per pool slot, so the archive never sits in memory whole.
    const photo = await readPhoto();
    const thumb = await compressThumb(photo);
    const base = crypto.randomUUID();
    const pathBase = `${imagePrefix(uid, task.itemId)}/${base}`;
    const pathFull = `${pathBase}${extensionForType(fullType)}`;
    const pathThumb = `${pathBase}.thumb${extensionForType(thumb.type)}`;
    const fullError = await uploadWithRetry({
      path: pathFull,
      blob: new Blob([photo], { type: fullType }),
      uploadImage,
      signal,
    });
    if (fullError) {
      throw new Error('Could not upload photograph', { cause: fullError });
    }
    // A failed thumbnail is not a failed photograph: `path_thumb` goes null, as in the upload path.
    const thumbError = await uploadWithRetry({
      path: pathThumb,
      blob: thumb,
      uploadImage,
      signal,
    });
    if (thumbError) {
      console.warn('Thumbnail upload failed:', thumbError);
    }

    const { error: rowError } = await createImage({
      item_id: task.itemId,
      path_full: pathFull,
      path_thumb: thumbError ? null : pathThumb,
      size_bytes: photo.size,
      created_at: task.createdAt,
    });
    if (rowError) {
      throw new Error('Could not record photograph', { cause: rowError });
    }
    return true;
  } catch (error) {
    // A full quota refuses every later photograph too; an archive that lies about one entry is trusted for none.
    if (
      error instanceof ImportCancelledError ||
      error instanceof ZipReadError ||
      isQuotaExceeded(error)
    ) {
      throw error;
    }
    console.error('Skipping photograph', task.archivePath, error);
    return false;
  }
}
