/** Shared `browser-image-compression` options for every derivative
 * CollectionBuddy generates (full-size and thumbnail alike): WebP output,
 * ~80% quality, off the main thread. Callers still supply their own
 * `maxWidthOrHeight`. */
export const WEBP_COMPRESSION_OPTIONS = {
  initialQuality: 0.8,
  fileType: 'image/webp',
  useWebWorker: true,
} as const;
