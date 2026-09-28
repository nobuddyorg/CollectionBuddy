import { encodingFor, type PhotoEncoding } from '../data/photoType';

// The bundler emits this as a hashed same-origin file; the library's default, a CDN, is refused by the CSP.
const LIBRARY_URL = new URL(
  'browser-image-compression/dist/browser-image-compression.js',
  import.meta.url,
).href;

let probedEncoding: Promise<string> | undefined;

// WebKit's canvas has no WebP encoder and answers a WebP request with PNG, ~10x the bytes (MDN browser-compat-data).
function probeWebpEncoding(): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob?.type ?? ''), 'image/webp');
  });
}

/** Every derivative: ~80% quality, off the main thread, as WebP where the browser encodes it and JPEG (or PNG) elsewhere. */
export async function compressPhoto(
  file: File,
  maxWidthOrHeight: number,
  encoding: PhotoEncoding = 'opaque',
): Promise<File> {
  probedEncoding ??= probeWebpEncoding();
  const [{ default: imageCompression }, probed] = await Promise.all([
    import('browser-image-compression'),
    probedEncoding,
  ]);
  return imageCompression(file, {
    maxWidthOrHeight,
    initialQuality: 0.8,
    fileType: encodingFor(probed, encoding),
    useWebWorker: true,
    // Absolute: the worker runs from a blob: URL, against which no path resolves.
    libURL: new URL(LIBRARY_URL, document.baseURI).href,
  });
}
