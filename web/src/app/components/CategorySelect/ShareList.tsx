'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import CenteredModal from '../CenteredModal';
import { useConfirm } from '../Confirm/ConfirmProvider';
import { IconType } from '../Icon';
import type { CategoryShareSummary, ShareRole } from '../../data/shares';
import { GhostIconButton, HEADER_TOGGLE_BOX } from './Buttons';
import { isShareExpired } from './shareExpiry';
import type { UseShares } from './useShares';
import { labelClasses } from '../ui/labelClasses';

export function ShareList({ shares }: { shares: UseShares }) {
  const { t, locale } = useI18n();
  const confirm = useConfirm();
  // Every row action is off while a reload is in flight: the rows may be about to change under the click.
  const {
    shares: list,
    isLoading,
    isRevoking,
    isUpdatingRole,
    revokeShare,
    updateShareRole,
  } = shares;
  // Below sm the row has no room for "Can edit"; a pen icon opens the same checkbox in a modal.
  const [roleModalShareId, setRoleModalShareId] = useState<string | null>(null);

  const onToggleRole = useCallback(
    async (share: CategoryShareSummary, role: ShareRole) => {
      // Only granting needs confirmation; taking edit access away is the safe direction.
      if (role === 'editor') {
        const message = t('category_select.share_editor_confirm', {
          email: share.invited_email,
        });
        if (!(await confirm(message))) return;
      }
      await updateShareRole(share.id, role);
    },
    [confirm, t, updateShareRole],
  );

  // className sets display too: a hardcoded flex would fight a caller's hidden sm:flex.
  const roleCheckbox = (share: CategoryShareSummary, className: string) => (
    <label className={className}>
      <input
        type="checkbox"
        data-testid="share-can-edit"
        checked={share.role === 'editor'}
        onChange={(event) =>
          void onToggleRole(share, event.target.checked ? 'editor' : 'viewer')
        }
        disabled={isUpdatingRole || isLoading}
        className="h-4 w-4 rounded-sm ring-1 ring-inset ring-control-border accent-foreground"
      />
      {t('category_select.share_can_edit')}
    </label>
  );

  const onRevoke = useCallback(
    async (shareId: string, invitedEmail: string) => {
      const message = t('category_select.share_revoke_confirm', {
        email: invitedEmail,
      });
      if (!(await confirm(message))) return;
      await revokeShare(shareId);
    },
    [confirm, t, revokeShare],
  );

  const now = new Date();

  return (
    <>
      {!isLoading && list.length === 0 && (
        <p data-testid="share-list-empty" className={labelClasses()}>
          {t('category_select.share_list_empty')}
        </p>
      )}

      {list.length > 0 && (
        <ul className="flex flex-col divide-y divide-border/60">
          <li className={labelClasses('pb-1.5')}>
            {t('category_select.share_list_title')}
          </li>
          {list.map((share) => {
            const isExpired =
              !!share.expires_at &&
              isShareExpired({ expiresAt: share.expires_at, now });
            let expiryLabel = t('category_select.share_no_expiry');
            if (share.expires_at) {
              const date = new Date(share.expires_at).toLocaleDateString(
                locale,
              );
              expiryLabel = isExpired
                ? t('category_select.share_expired_on', { date })
                : t('category_select.share_expires_on', { date });
            }
            return (
              <li
                key={share.id}
                data-testid="share-row"
                // ml-4, not pl-4, so the divide-y border indents too; padding does not move a border.
                className="ml-4 flex flex-col gap-1.5 py-2 text-sm sm:flex-row sm:items-center sm:gap-2"
              >
                <div className="flex min-w-0 items-center gap-1.5 sm:flex-1">
                  <span
                    data-testid="share-email-label"
                    className="truncate min-w-0"
                  >
                    {share.invited_email}
                  </span>
                  {share.role === 'editor' && (
                    <span
                      data-testid="share-editor-badge"
                      className="tag-chip shrink-0"
                    >
                      {t('category_select.share_role_editor_badge')}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 sm:contents">
                  <span
                    data-testid="share-expiry-label"
                    className={`shrink-0 sm:mr-4 ${isExpired ? 'text-destructive' : 'text-muted-foreground'}`}
                  >
                    {expiryLabel}
                  </span>

                  <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                    {roleCheckbox(share, 'hidden items-center gap-1.5 sm:flex')}
                    <GhostIconButton
                      testId="share-edit-access"
                      onClick={() => setRoleModalShareId(share.id)}
                      disabled={isLoading}
                      label={t('category_select.share_edit_access')}
                      icon={IconType.Edit}
                      iconClassName="w-4 h-4"
                      boxClassName={HEADER_TOGGLE_BOX}
                      className="sm:hidden"
                    />
                    <GhostIconButton
                      testId="share-revoke"
                      onClick={() =>
                        void onRevoke(share.id, share.invited_email)
                      }
                      disabled={isRevoking || isLoading}
                      label={t('category_select.share_revoke')}
                      icon={IconType.Trash}
                      iconClassName="w-4 h-4"
                      boxClassName={HEADER_TOGGLE_BOX}
                      tone="destructive"
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <RoleModal
        share={list.find((share) => share.id === roleModalShareId) ?? null}
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
    share: CategoryShareSummary,
    className: string,
  ) => React.ReactNode;
}) {
  return (
    <CenteredModal
      open={!!share}
      onOpenChange={onOpenChange}
      title={share?.invited_email ?? ''}
    >
      {share && renderCheckbox(share, 'flex items-center gap-1.5')}
    </CenteredModal>
  );
}
