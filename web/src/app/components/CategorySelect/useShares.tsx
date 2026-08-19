'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { restoreAt } from '../../lib/optimistic';
import { useToast } from '../Toast/ToastProvider';
import {
  createShare as createShareRow,
  deleteShare as deleteShareRow,
  listSharesForCategory,
  updateShareRole as updateShareRoleRow,
} from '../../data/shares';
import type { CategoryShareSummary, ShareRole } from '../../data/shares';

export type UseShares = ReturnType<typeof useShares>;

// This hook doesn't know or care whether the category belongs to the
// caller or was shared with them -- the "select own or invited
// category_shares" RLS policy (0011) already answers that by what rows
// come back.
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
    } catch (e) {
      toast.reportError(
        'reload shares',
        e,
        t('category_select.share_load_error'),
      );
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [categoryId, t, toast]);

  // Always viewer: a share can only be promoted to editor afterward, via
  // updateShareRole below, once it exists as a row the owner can see and
  // toggle -- not chosen up front at invite time.
  const createShare = useCallback(
    async (invitedEmail: string, expiresAt: string | null) => {
      if (!categoryId || isSharing) return false;
      setIsSharing(true);
      try {
        const { data, error } = await createShareRow(
          categoryId,
          invitedEmail,
          expiresAt,
        );
        if (error) throw error;
        if (data) setShares((prev) => [...prev, data]);
        toast.success(t('category_select.share_success'));
        return true;
      } catch (e) {
        toast.reportError('create share', e, t('category_select.share_error'));
        return false;
      } finally {
        setIsSharing(false);
      }
    },
    [categoryId, isSharing, t, toast],
  );

  // Owner-only toggle between viewer and editor on an existing grant -- the
  // "update own category_shares role" RLS policy (0014_editor_shares.sql)
  // is what actually limits this to the owner; the grantee's own panel
  // never renders the control that calls this.
  const updateShareRole = useCallback(
    async (shareId: string, role: ShareRole) => {
      if (isUpdatingRole) return false;
      setIsUpdatingRole(true);
      try {
        const { data, error } = await updateShareRoleRow(shareId, role);
        if (error) throw error;
        if (data) {
          setShares((prev) => prev.map((s) => (s.id === shareId ? data : s)));
        }
        return true;
      } catch (e) {
        toast.reportError(
          'update share role',
          e,
          t('category_select.share_role_update_error'),
        );
        return false;
      } finally {
        setIsUpdatingRole(false);
      }
    },
    [isUpdatingRole, t, toast],
  );

  // Backs both a grant the owner revokes and the caller's own grant when
  // leaving a shared category -- deleteShareRow doesn't distinguish, and
  // neither does this: the RLS policy already limited which row the caller
  // was allowed to name. The row is hidden immediately; the actual delete
  // is deferred to the toast's undo window (see useToast), so the caller
  // supplies its own success/error copy rather than getting one outcome
  // back synchronously.
  const deleteShare = useCallback(
    (
      shareId: string,
      opts: {
        successMessage: string;
        errorMessage: string;
        onRestore?: () => void;
      },
    ) => {
      if (isRevoking) return;
      const index = shares.findIndex((s) => s.id === shareId);
      const snapshot = shares[index];
      if (!snapshot) return;
      setShares((prev) => prev.filter((s) => s.id !== shareId));

      const restoreAndNotify = () => {
        setShares((prev) => restoreAt(prev, index, snapshot));
        opts.onRestore?.();
      };

      toast.success(opts.successMessage, {
        action: { label: t('common.undo'), onClick: restoreAndNotify },
        onExpire: async () => {
          setIsRevoking(true);
          try {
            const { error } = await deleteShareRow(shareId);
            if (error) throw error;
          } catch (e) {
            console.error('delete share', e);
            toast.error(opts.errorMessage);
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
