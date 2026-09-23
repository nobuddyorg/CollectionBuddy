'use client';
import { useCallback } from 'react';

import { useConfirm } from '../components/Confirm/ConfirmProvider';
import { useI18n } from '../i18n/useI18n';

/** The one path every dismissal takes: closes at once when clean, else asks first, then runs onDiscard. */
export function useGuardedModalClose(
  isDirty: boolean,
  onClose: () => void,
  onDiscard?: () => void,
) {
  const confirm = useConfirm();
  const { t } = useI18n();
  return useCallback(() => {
    if (!isDirty) {
      onClose();
      return;
    }
    void (async () => {
      if (await confirm(t('item_create.confirm_discard'))) {
        onDiscard?.();
        onClose();
      }
    })();
  }, [isDirty, confirm, onClose, onDiscard, t]);
}
