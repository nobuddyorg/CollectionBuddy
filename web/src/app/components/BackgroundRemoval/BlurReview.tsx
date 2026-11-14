'use client';

import type { RefObject } from 'react';
import { useI18n } from '../../i18n/useI18n';
import { buttonClasses, filledButtonClasses } from '../ui/buttonClasses';
import { BlurWarning, Preview, usePreviewFrame } from './PhotoPreview';
import type { CutoutChoice } from './useBackgroundRemovalUpload';

/** A blurry photo, shown before it uploads, with the choice to keep it or skip it and take or pick another. */
export function BlurReview({
  file,
  onChoose,
  keepRef,
}: {
  file: File;
  onChoose: (choice: CutoutChoice) => void;
  /** The dialog focuses it on opening: Enter keeps the photo, as with no warning at all. */
  keepRef: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useI18n();
  const frame = usePreviewFrame();

  return (
    <div data-testid="blur-review" className="space-y-4">
      <div className={`${frame} mx-auto max-w-xs`}>
        <Preview
          blob={file}
          alt={t('sharpness.preview_alt')}
          testId="blur-preview"
        />
      </div>
      <BlurWarning />
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          data-testid="blur-skip"
          onClick={() => onChoose({ kind: 'skip' })}
          className={buttonClasses()}
        >
          {t('sharpness.skip')}
        </button>
        <button
          ref={keepRef}
          type="button"
          data-testid="blur-keep"
          onClick={() => onChoose({ kind: 'original' })}
          className={filledButtonClasses('primary')}
        >
          {t('sharpness.keep')}
        </button>
      </div>
    </div>
  );
}
