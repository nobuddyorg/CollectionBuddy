import { extensionOf } from './exportFormat';

// The types the item-images bucket accepts (0007_storage.sql), each with the extension a Storage path names it by.
const EXTENSION_BY_TYPE = {
  'image/webp': '.webp',
  'image/jpeg': '.jpg',
  'image/png': '.png',
} as const;

type StoredPhotoType = keyof typeof EXTENSION_BY_TYPE;

const TYPE_BY_EXTENSION: Record<string, StoredPhotoType> = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
};

/** WebP where the canvas can encode it; JPEG, which the bucket also accepts, where it answered with anything else. */
export function encodingFor(probedType: string): 'image/webp' | 'image/jpeg' {
  return probedType === 'image/webp' ? 'image/webp' : 'image/jpeg';
}

/** `.webp`, `.jpg` or `.png`: what a derivative is stored under, after the type its encoder actually produced. */
export function extensionForType(type: string): string {
  if (!Object.hasOwn(EXTENSION_BY_TYPE, type)) {
    throw new Error(`The photo bucket does not accept "${type}"`);
  }
  return EXTENSION_BY_TYPE[type as StoredPhotoType];
}

/** The type an archived photograph is stored as, read off the extension its export named it by. */
export function typeForArchivePath(path: string): StoredPhotoType {
  const extension = extensionOf(path).toLowerCase();
  if (!Object.hasOwn(TYPE_BY_EXTENSION, extension)) {
    throw new Error(`Not a photograph the bucket accepts: ${path}`);
  }
  return TYPE_BY_EXTENSION[extension];
}
