'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import CenteredModal from '../CenteredModal';
import { useConfirm } from '../Confirm/ConfirmProvider';
import Icon, { IconType } from '../Icon';
import type { CategoryShareSummary } from '../../data/shares';
import type { UseShares } from './useShares';
import { labelClasses } from '../ui/labelClasses';

export function ShareList({ shares }: { shares: UseShares }) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const {
    shares: list,
    isLoading,
    isRevoking,
    isUpdatingRole,
    deleteShare,
    updateShareRole,
  } = shares;
  // Below `sm` a share row has no room for the "Can edit" label alongside
  // email/expiry/revoke -- swapped for a pen icon that opens the same
  // checkbox in a modal.
  const [roleModalShareId, setRoleModalShareId] = useState<string | null>(null);

  const onToggleRole = useCallback(
    async (shareId: string, invitedEmail: string, canEdit: boolean) => {
      // Only granting needs confirmation -- taking edit access back away is
      // the safe direction.
      if (canEdit) {
        const message = t('category_select.share_editor_confirm').replace(
          '{email}',
          invitedEmail,
        );
        if (!(await confirm(message))) return;
      }
      await updateShareRole(shareId, canEdit ? 'editor' : 'viewer');
    },
    [confirm, t, updateShareRole],
  );

  // `className` sets the label's display too -- a hardcoded `flex` here
  // would fight a caller's `hidden ... sm:flex`.
  const roleCheckbox = (s: CategoryShareSummary, className: string) => (
    <label className={className}>
      <input
        type="checkbox"
        checked={s.role === 'editor'}
        onChange={(e) =>
          void onToggleRole(s.id, s.invited_email, e.target.checked)
        }
        disabled={isUpdatingRole}
        className="h-4 w-4 rounded-sm ring-1 ring-inset ring-control-border accent-foreground"
      />
      {t('category_select.share_can_edit')}
    </label>
  );

  const onRevoke = useCallback(
    async (shareId: string, invitedEmail: string) => {
      const message = t('category_select.share_revoke_confirm').replace(
        '{email}',
        invitedEmail,
      );
      if (!(await confirm(message))) return;
      deleteShare(shareId, {
        successMessage: t('category_select.share_revoke_success'),
        errorMessage: t('category_select.share_revoke_error'),
      });
    },
    [confirm, t, deleteShare],
  );

  return (
    <>
      {!isLoading && list.length === 0 && (
        <p className={labelClasses()}>
          {t('category_select.share_list_empty')}
        </p>
      )}

      {list.length > 0 && (
        <ul className="flex flex-col divide-y divide-border/60">
          <li className={labelClasses('pb-1.5')}>
            {t('category_select.share_list_title')}
          </li>
          {list.map((s) => {
            const isExpired =
              !!s.expires_at &&
              new Date(s.expires_at).getTime() <= new Date().getTime();
            return (
              <li
                key={s.id}
                // `sm:flex-1` on email below, not `justify-between` here:
                // with three items, justify-between free-floats the middle
                // one (expiry) depending on email length. `ml-4` rather
                // than `pl-4` so the `divide-y` border indents too --
                // padding doesn't move a box's border.
                className="ml-4 flex flex-col gap-1.5 py-2 text-sm sm:flex-row sm:items-center sm:gap-2"
              >
                <div className="flex min-w-0 items-center gap-1.5 sm:flex-1">
                  <span className="truncate min-w-0">{s.invited_email}</span>
                  {s.role === 'editor' && (
                    <span className="tag-chip shrink-0">
                      {t('category_select.share_role_editor_badge')}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 sm:contents">
                  <span
                    className={`shrink-0 sm:mr-4 ${isExpired ? 'text-destructive' : 'text-muted-foreground'}`}
                  >
                    {s.expires_at
                      ? t(
                          isExpired
                            ? 'category_select.share_expired_on'
                            : 'category_select.share_expires_on',
                        ).replace(
                          '{date}',
                          new Date(s.expires_at).toLocaleDateString(),
                        )
                      : t('category_select.share_no_expiry')}
                  </span>

                  <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                    {roleCheckbox(s, 'hidden items-center gap-1.5 sm:flex')}
                    <button
                      type="button"
                      onClick={() => setRoleModalShareId(s.id)}
                      aria-label={t('category_select.share_edit_access')}
                      title={t('category_select.share_edit_access')}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:hidden sm:h-9 sm:w-9"
                    >
                      <Icon
                        icon={IconType.Edit}
                        className="w-4 h-4"
                        aria-hidden="true"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onRevoke(s.id, s.invited_email)}
                      disabled={isRevoking}
                      aria-label={t('category_select.share_revoke')}
                      title={t('category_select.share_revoke')}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-40 sm:h-9 sm:w-9"
                    >
                      <Icon
                        icon={IconType.Trash}
                        className="w-4 h-4"
                        aria-hidden="true"
                      />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <RoleModal
        share={list.find((s) => s.id === roleModalShareId) ?? null}
        onOpenChange={(open) => !open && setRoleModalShareId(null)}
        renderCheckbox={roleCheckbox}
      />
    </>
  );
}

function RoleModal({
  share,
  onOpenChange,
  renderCheckbox,
}: {
  share: CategoryShareSummary | null;
  onOpenChange: (open: boolean) => void;
  renderCheckbox: (
    s: CategoryShareSummary,
    className: string,
  ) => React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <CenteredModal
      open={!!share}
      onOpenChange={onOpenChange}
      title={share?.invited_email ?? ''}
      closeLabel={t('common.close')}
    >
      {share && renderCheckbox(share, 'flex items-center gap-1.5')}
    </CenteredModal>
  );
}
