'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { restoreAt } from '../../lib/optimistic';
import { useToast } from '../Toast/ToastProvider';
import { isQuotaExceeded } from '../../data/quota';
import {
  createShare as createShareRow,
  deleteShare as deleteShareRow,
  listSharesForCategory,
  updateShareRole as updateShareRoleRow,
} from '../../data/shares';
import type { CategoryShareSummary, ShareRole } from '../../data/shares';

export type UseShares = ReturnType<typeof useShares>;

// Owner or grantee makes no difference here: RLS decides which category_shares rows come back.
export function useShares(categoryId: string | null) {
  const { t } = useI18n();
  const toast = useToast();
  const [shares, setShares] = useState<CategoryShareSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  const reload = useCallback(async () => {
    if (!categoryId) {
      setShares([]);
      return [];
    }
    setIsLoading(true);
    try {
      const { data, error } = await listSharesForCategory(categoryId);
      if (error) throw error;
      const list = data ?? [];
      setShares(list);
      return list;
    } catch (error) {
      toast.reportError(
        'reload shares',
        error,
        t('category_select.share_load_error'),
      );
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [categoryId, t, toast]);

  // Always issued as viewer; promotion to editor happens afterward via updateShareRole.
  const createShare = useCallback(
    async (invitedEmail: string, expiresAt: string | null) => {
      if (!categoryId || isSharing) return false;
      setIsSharing(true);
      try {
        const { data, error } = await createShareRow({
          categoryId,
          invitedEmail,
          expiresAt,
        });
        if (error) throw error;
        if (data) setShares((previous) => [...previous, data]);
        toast.success(t('category_select.share_success'));
        return true;
      } catch (error) {
        toast.reportError(
          'create share',
          error,
          isQuotaExceeded(error)
            ? t('category_select.share_quota_error')
            : t('category_select.share_error'),
        );
        return false;
      } finally {
        setIsSharing(false);
      }
    },
    [categoryId, isSharing, t, toast],
  );

  // The "update own category_shares role" RLS policy, not this hook, limits the toggle to the owner.
  const updateShareRole = useCallback(
    async (shareId: string, role: ShareRole) => {
      if (isUpdatingRole) return false;
      setIsUpdatingRole(true);
      try {
        const { data, error } = await updateShareRoleRow(shareId, role);
        if (error) throw error;
        if (data) {
          setShares((previous) =>
            previous.map((share) => (share.id === shareId ? data : share)),
          );
        }
        return true;
      } catch (error) {
        toast.reportError(
          'update share role',
          error,
          t('category_select.share_role_update_error'),
        );
        return false;
      } finally {
        setIsUpdatingRole(false);
      }
    },
    [isUpdatingRole, t, toast],
  );

  // The delete is deferred to the toast's undo window, so the caller supplies its own copy.
  const deleteShare = useCallback(
    (
      shareId: string,
      options: {
        successMessage: string;
        errorMessage: string;
        onRestore?: () => void;
      },
    ) => {
      if (isRevoking) return;
      const index = shares.findIndex((share) => share.id === shareId);
      const snapshot = shares[index];
      if (!snapshot) return;
      setShares((previous) => previous.filter((share) => share.id !== shareId));

      const restoreAndNotify = () => {
        setShares((previous) =>
          restoreAt({ list: previous, index, item: snapshot }),
        );
        options.onRestore?.();
      };

      toast.success(options.successMessage, {
        action: { label: t('common.undo'), onClick: restoreAndNotify },
        onExpire: async () => {
          setIsRevoking(true);
          try {
            const { error } = await deleteShareRow(shareId);
            if (error) throw error;
          } catch (error) {
            console.error('delete share', error);
            toast.error(options.errorMessage);
            restoreAndNotify();
          } finally {
            setIsRevoking(false);
          }
        },
      });
    },
    [isRevoking, shares, t, toast],
  );

  return {
    shares,
    isLoading,
    isSharing,
    isRevoking,
    isUpdatingRole,
    reload,
    createShare,
    deleteShare,
    updateShareRole,
  };
}
