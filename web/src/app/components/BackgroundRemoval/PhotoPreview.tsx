'use client';

import { useCallback } from 'react';
import { useI18n } from '../../i18n/useI18n';
import {
  photoBackdropClass,
  usePhotoBackdrop,
} from '../../lib/usePhotoBackdrop';

const FRAME =
  'grid aspect-square place-items-center overflow-hidden rounded-sm ring-1 ring-border';
// A checkerboard, so a transparent background reads as transparent in both themes.
const CHECKERBOARD =
  'bg-[conic-gradient(var(--color-muted)_25%,var(--color-card)_0_50%,var(--color-muted)_0_75%,var(--color-card)_0)] bg-size-[16px_16px]';

/** A preview's frame, on the backdrop the catalogue will show the photo on; on the theme's, a checkerboard. */
export function usePreviewFrame(): string {
  const { backdrop } = usePhotoBackdrop();
  return `${FRAME} ${backdrop === 'theme' ? CHECKERBOARD : photoBackdropClass(backdrop)}`;
}

export function Preview({
  blob,
  alt,
  testId,
}: {
  blob: Blob;
  alt: string;
  testId: string;
}) {
  // A ref with cleanup, which React 19 never calls with null, so each object URL is revoked with its image.
  const show = useCallback(
    (image: HTMLImageElement | null) => {
      const url = URL.createObjectURL(blob);
      image!.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [blob],
  );
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a blob: URL of a photo that has not left the device; next/image cannot take one
    <img
      ref={show}
      alt={alt}
      data-testid={testId}
      className="h-full w-full object-contain"
    />
  );
}

/** Said wherever a picked photo reads as blurry, before anything uploads. */
export function BlurWarning() {
  const { t } = useI18n();
  return (
    <p role="status" data-testid="blur-warning" className="text-sm">
      {t('sharpness.warning')}
    </p>
  );
}
