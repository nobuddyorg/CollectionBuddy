import { verifiedUserId } from '../../data/auth';
import { imagePrefix, uploadImageObject } from '../../data/images';
import { extensionForType, type PhotoUpload } from '../../data/photoType';
import { compressPhoto } from '../../lib/imageCompression';

/** A photograph compressed to its two sizes and stored under the uploader's prefix: the `images` row to insert for it. */
export async function storePhotoPair(
  itemId: string,
  { file, encoding = 'opaque' }: PhotoUpload,
) {
  const userId = await verifiedUserId();
  if (!userId) throw new Error('No user session');

  const fullFile = await compressPhoto(file, {
    maxWidthOrHeight: 1000,
    encoding,
  });
  // From the already-downscaled full size; 600px covers strip cells and pair halves at 3x density.
  const thumbnailFile = await compressPhoto(fullFile, {
    maxWidthOrHeight: 600,
    encoding,
  });

  const pathBase = `${imagePrefix(userId, itemId)}/${crypto.randomUUID()}`;
  const pathFull = `${pathBase}${extensionForType(fullFile.type)}`;
  const pathThumb = `${pathBase}.thumb${extensionForType(thumbnailFile.type)}`;

  const fullUpload = await uploadImageObject(pathFull, fullFile);
  if (fullUpload.error) throw fullUpload.error;

  const thumbnailUpload = await uploadImageObject(pathThumb, thumbnailFile);
  const thumbnailUploaded = !thumbnailUpload.error;
  if (!thumbnailUploaded) {
    console.warn('Thumbnail upload failed:', thumbnailUpload.error);
  }

  return {
    item_id: itemId,
    path_full: pathFull,
    path_thumb: thumbnailUploaded ? pathThumb : null,
    size_bytes: fullFile.size,
  };
}
