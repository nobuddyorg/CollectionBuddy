'use client';

import { useCallback } from 'react';
import { useI18n } from '../../i18n/useI18n';

// Black, as the catalogue shows a cut-out's see-through background, in both themes.
export const FRAME =
  'grid aspect-square place-items-center overflow-hidden rounded-sm ring-1 ring-border bg-black';

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
