'use client';
import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useConfirm } from './components/Confirm/ConfirmProvider';
import { useToast } from './components/Toast/ToastProvider';
import { deleteOwnAccount } from './data/account';
import { useI18n } from './i18n/useI18n';
import { forgetUserData } from './userData';

export function useDeleteAccount(userId: string) {
  const router = useRouter();
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);

  const deleteAccount = useCallback(async () => {
    if (!(await confirm(t('account.confirm_delete')))) return;
    setDeleting(true);
    let failure: unknown;
    try {
      // A delete still inside its undo window would otherwise run after the account is gone, and fail.
      await toast.commitPending();
      ({ error: failure } = await deleteOwnAccount(userId));
    } catch (thrown) {
      failure = thrown;
    }
    if (failure) {
      toast.reportError('delete account', failure, t('account.delete_error'));
      setDeleting(false);
      return;
    }
    forgetUserData();
    toast.success(t('account.delete_success'));
    router.replace('/login');
  }, [confirm, router, t, toast, userId]);

  return { deleteAccount, deleting };
}
