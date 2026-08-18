'use client';
import { useCallback } from 'react';

import { useConfirm } from '../components/Confirm/ConfirmProvider';
import { useI18n } from '../i18n/useI18n';

/**
 * Guards a modal's close behind a confirm dialog when there's unsaved work:
 * closes immediately if `isDirty` is false, otherwise asks first and only
 * closes (running `onDiscard` first, to clear the caller's own dirty state)
 * once confirmed. Meant to be the single path every dismissal goes through
 * (backdrop, Escape, a dialog's own X, an explicit Cancel button), so a
 * stray tap can't lose an edit any more easily than deliberate Cancel would.
 */
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
