import { encodingFor } from '../data/photoType';

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

/** Every derivative: ~80% quality, off the main thread, as WebP where the browser encodes it and JPEG elsewhere. */
export async function compressPhoto(
  file: File,
  maxWidthOrHeight: number,
): Promise<File> {
  probedEncoding ??= probeWebpEncoding();
  const [{ default: imageCompression }, probed] = await Promise.all([
    import('browser-image-compression'),
    probedEncoding,
  ]);
  return imageCompression(file, {
    maxWidthOrHeight,
    initialQuality: 0.8,
    fileType: encodingFor(probed),
    useWebWorker: true,
  });
}
