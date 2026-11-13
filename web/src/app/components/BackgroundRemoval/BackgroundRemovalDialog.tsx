'use client';

import dynamic from 'next/dynamic';
import { useI18n } from '../../i18n/useI18n';
import CenteredModal from '../CenteredModal';
import { Spinner } from '../ui/Spinner';
import { loadCutoutReview } from './load';
import { BlurReview } from './BlurReview';
import type { QueuedPhoto } from './photoBatch';
import type { CutoutChoice } from './useBackgroundRemovalUpload';

function Loading() {
  const { t } = useI18n();
  return (
    <span role="status" aria-label={t('common.loading')}>
      <Spinner size="lg" />
    </span>
  );
}

const CutoutReview = dynamic(loadCutoutReview, {
  ssr: false,
  loading: Loading,
});

/** The review a picked photo may need: a cut-out to compare, loaded on demand, or a blur warning, which is small enough to ship. */
export function BackgroundRemovalDialog({
  pending,
  onChoose,
}: {
  pending: QueuedPhoto | null;
  onChoose: (choice: CutoutChoice) => void;
}) {
  const { t } = useI18n();
  return (
    <CenteredModal
      open={pending !== null}
      onOpenChange={() => onChoose({ kind: 'cancel' })}
      title={
        pending?.removeBackground === false
          ? t('sharpness.title')
          : t('background_removal.title')
      }
      closeOnBackdrop={false}
    >
      {pending && pending.position.total > 1 && (
        <p
          data-testid="cutout-progress"
          className="text-sm text-muted-foreground"
        >
          {t('background_removal.progress', {
            current: pending.position.current,
            total: pending.position.total,
          })}
        </p>
      )}
      {/* Keyed per photo: each gets a fresh review, focus included. */}
      {pending?.removeBackground && (
        <CutoutReview
          key={pending.key}
          file={pending.file}
          sharpness={pending.sharpness}
          onChoose={onChoose}
        />
      )}
      {pending?.removeBackground === false && (
        <BlurReview key={pending.key} file={pending.file} onChoose={onChoose} />
      )}
    </CenteredModal>
  );
}
