/** Every derivative: WebP at ~80% quality, off the main thread; callers add their own maxWidthOrHeight. */
export const WEBP_COMPRESSION_OPTIONS = {
  initialQuality: 0.8,
  fileType: 'image/webp',
  useWebWorker: true,
} as const;
