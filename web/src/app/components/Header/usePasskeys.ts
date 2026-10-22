'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  deletePasskey,
  listPasskeys,
  registerPasskey,
  type Passkey,
} from '../../data/passkeys';
import { useI18n } from '../../i18n/useI18n';
import {
  isAlreadyRegistered,
  isDismissedCeremony,
} from '../../lib/passkeyCeremony';
import { useToast } from '../Toast/ToastProvider';

type PasskeyList =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; passkeys: Passkey[] };

/** The account's saved passkeys, listed afresh each time the menu mounts this, with adding and removing one. */
export function usePasskeys() {
  const { t } = useI18n();
  const toast = useToast();
  const [list, setList] = useState<PasskeyList>({ status: 'loading' });
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const { data, error } = await listPasskeys();
    if (data === null) {
      console.error('listing passkeys failed', error);
      setList({ status: 'failed' });
      return;
    }
    setList({ status: 'ready', passkeys: data });
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const add = async () => {
    setBusy(true);
    try {
      const { error } = await registerPasskey();
      if (!error) {
        toast.success(t('passkeys.added'));
        await reload();
      } else if (isAlreadyRegistered(error)) {
        toast.error(t('passkeys.already_added'));
      } else if (!isDismissedCeremony(error)) {
        toast.reportError(
          'passkey registration',
          error,
          t('passkeys.add_error'),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (passkeyId: string) => {
    setBusy(true);
    try {
      const { error } = await deletePasskey(passkeyId);
      if (error) {
        toast.reportError('passkey removal', error, t('passkeys.remove_error'));
        return;
      }
      toast.success(t('passkeys.removed'));
      await reload();
    } finally {
      setBusy(false);
    }
  };

  return { list, busy, add, remove };
}
