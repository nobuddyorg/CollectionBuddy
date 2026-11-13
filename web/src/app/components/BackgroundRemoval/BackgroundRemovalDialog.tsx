'use client';

import dynamic from 'next/dynamic';
import { useI18n } from '../../i18n/useI18n';
import CenteredModal from '../CenteredModal';
import { Spinner } from '../ui/Spinner';
import { loadCutoutReview } from './load';
import type { CutoutChoice, PendingCutout } from './useBackgroundRemovalUpload';

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

/** Only this shell is in the main bundle; the review and everything it runs load when a photo is picked. */
export function BackgroundRemovalDialog({
  pending,
  onChoose,
}: {
  pending: PendingCutout | null;
  onChoose: (choice: CutoutChoice) => void;
}) {
  const { t } = useI18n();
  return (
    <CenteredModal
      open={pending !== null}
      onOpenChange={() => onChoose({ kind: 'cancel' })}
      title={t('background_removal.title')}
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
      {/* Keyed by position: each photo of a pick gets a fresh review, focus included. */}
      {pending && (
        <CutoutReview
          key={pending.position.current}
          file={pending.file}
          onChoose={onChoose}
        />
      )}
    </CenteredModal>
  );
}
