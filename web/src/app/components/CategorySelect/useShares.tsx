'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { restoreAt } from '../../lib/optimistic';
import { useRequestSequence } from '../../lib/useRequestSequence';
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

type LoadedShares = {
  categoryId: string | null;
  list: CategoryShareSummary[];
};

const NO_SHARES: CategoryShareSummary[] = [];

/** Applies `update` only while the list is still the one loaded for `categoryId`, whatever was selected meanwhile. */
function inCategory(
  categoryId: string,
  update: (list: CategoryShareSummary[]) => CategoryShareSummary[],
) {
  return (previous: LoadedShares): LoadedShares =>
    previous.categoryId === categoryId
      ? { categoryId, list: update(previous.list) }
      : previous;
}

// Owner or grantee makes no difference here: RLS decides which category_shares rows come back.
export function useShares(categoryId: string | null) {
  const { t } = useI18n();
  const toast = useToast();
  // Tagged with its category: after a switch no row, and so no share id, of the previous one survives.
  const [loaded, setLoaded] = useState<LoadedShares>({ categoryId, list: [] });
  const shares = loaded.categoryId === categoryId ? loaded.list : NO_SHARES;
  const [isLoading, setIsLoading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  // A switch A -> B -> A must not let A's first, slower response replace its second.
  const { next, isCurrent } = useRequestSequence();

  const reload = useCallback(async () => {
    if (!categoryId) return [];
    const mySequence = next();
    setIsLoading(true);
    try {
      const { data, error } = await listSharesForCategory(categoryId);
      if (error) throw error;
      const list = data ?? [];
      if (isCurrent(mySequence)) setLoaded({ categoryId, list });
      return list;
    } catch (error) {
      // Cleared, not kept: what is left from before may belong to the category just switched away from.
      if (isCurrent(mySequence)) {
        setLoaded({ categoryId, list: [] });
        toast.reportError(
          'reload shares',
          error,
          t('category_select.share_load_error'),
        );
      } else {
        console.error('reload shares', error);
      }
      return [];
    } finally {
      if (isCurrent(mySequence)) setIsLoading(false);
    }
  }, [categoryId, next, isCurrent, t, toast]);

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
        if (data) setLoaded(inCategory(categoryId, (list) => [...list, data]));
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
      if (isUpdatingRole || !shares.some((share) => share.id === shareId))
        return false;
      setIsUpdatingRole(true);
      try {
        const { data, error } = await updateShareRoleRow(shareId, role);
        if (error) throw error;
        if (data) {
          setLoaded((previous) => ({
            ...previous,
            list: previous.list.map((share) =>
              share.id === shareId ? data : share,
            ),
          }));
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
    [isUpdatingRole, shares, t, toast],
  );

  // Sent at once and not optimistic: the row goes when the grant has, never before.
  const removeShare = useCallback(
    async (shareId: string, errorMessage: string) => {
      if (isRevoking || !shares.some((share) => share.id === shareId))
        return false;
      setIsRevoking(true);
      try {
        const { error } = await deleteShareRow(shareId);
        if (error) throw error;
        setLoaded((previous) => ({
          ...previous,
          list: previous.list.filter((share) => share.id !== shareId),
        }));
        return true;
      } catch (error) {
        toast.reportError('delete share', error, errorMessage);
        return false;
      } finally {
        setIsRevoking(false);
      }
    },
    [isRevoking, shares, toast],
  );

  const revokeShare = useCallback(
    async (shareId: string) => {
      const index = shares.findIndex((share) => share.id === shareId);
      const revoked = shares[index];
      const removed = await removeShare(
        shareId,
        t('category_select.share_revoke_error'),
      );
      if (!removed) return;
      // Non-null: a row was just removed, and there are rows only while a category is selected.
      const revokedFrom = categoryId!;

      // The delete has already landed, so undo issues the same grant again as a new row.
      const reinstate = async () => {
        const { data, error } = await createShareRow({
          categoryId: revokedFrom,
          invitedEmail: revoked.invited_email,
          expiresAt: revoked.expires_at,
          role: revoked.role,
        });
        if (error) {
          toast.reportError(
            'reinstate share',
            error,
            t('category_select.share_reinstate_error'),
          );
          return;
        }
        setLoaded(
          inCategory(revokedFrom, (list) =>
            restoreAt({ list, index, item: data }),
          ),
        );
      };
      toast.success(t('category_select.share_revoke_success'), {
        action: { label: t('common.undo'), onClick: () => void reinstate() },
      });
    },
    [categoryId, removeShare, shares, t, toast],
  );

  // No undo: only the owner may issue a grant, so a grantee who left cannot re-create theirs.
  const leaveShare = useCallback(
    async (shareId: string) => {
      const removed = await removeShare(
        shareId,
        t('category_select.leave_error'),
      );
      if (removed) toast.success(t('category_select.leave_success'));
      return removed;
    },
    [removeShare, t, toast],
  );

  return {
    shares,
    isLoading,
    isSharing,
    isRevoking,
    isUpdatingRole,
    reload,
    createShare,
    revokeShare,
    leaveShare,
    updateShareRole,
  };
}
