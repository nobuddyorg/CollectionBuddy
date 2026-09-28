'use client';

import dynamic from 'next/dynamic';
import { useI18n } from '../../i18n/useI18n';
import CenteredModal from '../CenteredModal';
import { Spinner } from '../ui/Spinner';
import { loadCutoutReview } from './load';
import type { CutoutChoice, PendingCutout } from './useCoinCutoutUpload';

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
export function CoinCutoutDialog({
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
      title={t('coin_cutout.title')}
      closeLabel={t('common.close')}
      closeOnBackdrop={false}
    >
      {pending && <CutoutReview file={pending.file} onChoose={onChoose} />}
    </CenteredModal>
  );
}
