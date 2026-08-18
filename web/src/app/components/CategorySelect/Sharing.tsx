'use client';

import { useCallback, useRef, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import CenteredModal from '../CenteredModal';
import { useConfirm } from '../Confirm/ConfirmProvider';
import { useToast } from '../Toast/ToastProvider';
import Icon, { IconType } from '../Icon';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';
import { fieldClasses } from '../ui/fieldClasses';
import type { UseShares } from './useShares';
import type { CategoryShareSummary } from '../../data/shares';

type Props = {
  shares: UseShares;
};

// Local midnight would already be behind `now()` for most of the day
// picked, tripping the category_shares_expiry_in_future check constraint on
// a perfectly reasonable choice. End of day gives the whole picked date, as
// "expires August 11" would suggest.
function endOfDayIso(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59`).toISOString();
}

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Only ever mounted for a category the viewer owns -- a grantee manages
// their own grant via the panel's Delete button (onLeave in index.tsx).
export function SharingSection({ shares }: Props) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const toast = useToast();
  const {
    shares: list,
    isLoading,
    isSharing,
    isRevoking,
    isUpdatingRole,
    createShare,
    deleteShare,
    updateShareRole,
  } = shares;
  const [email, setEmail] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const expiryInputRef = useRef<HTMLInputElement>(null);
  // Below `sm` a share row has no room for the "Can edit" label alongside
  // email/expiry/revoke -- swapped for a pen icon that opens the same
  // checkbox in a modal.
  const [roleModalShareId, setRoleModalShareId] = useState<string | null>(null);

  // Delegates to the native date picker rather than reimplementing one.
  // `typeof el.showPicker === 'function'` guards against older Safari/
  // Firefox and jsdom (which stubs the property, so an `in` check would
  // still pass); falling back to focus() is what a click on the field
  // would do anyway on those.
  const openDatePicker = useCallback(() => {
    const el = expiryInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === 'function') {
      el.showPicker();
    } else {
      el.focus();
    }
  }, []);

  const onShare = useCallback(async () => {
    const trimmed = email.trim();
    if (!trimmed || isSharing) return;
    const expiresAt = expiryDate ? endOfDayIso(expiryDate) : null;
    const ok = await createShare(trimmed, expiresAt);
    if (ok) {
      setEmail('');
      setExpiryDate('');
    }
  }, [email, expiryDate, isSharing, createShare]);

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

  // Shared by the inline row (sm and up) and the mobile modal below, so the
  // control itself can't drift between the two places it's shown.
  // `className` is the label's whole class list, display utilities
  // included: mixing a hardcoded `flex` in here with a caller's
  // `hidden ... sm:flex` would put two unconditional display utilities on
  // the same element with no defined winner between them.
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
      const ok = await deleteShare(shareId);
      if (ok) {
        toast.success(t('category_select.share_revoke_success'));
      } else {
        toast.error(t('category_select.share_revoke_error'));
      }
    },
    [confirm, t, deleteShare, toast],
  );

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <p className="font-label text-[0.6875rem] text-muted-foreground">
        {t('category_select.share_section_title')}
      </p>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="share-email"
          className="font-label text-[0.6875rem] text-muted-foreground"
        >
          {t('category_select.share_invite_label')}
        </label>
        {/* `<input type="date">` renders its text-and-icon cluster
            completely differently per engine -- flush-right in Blink,
            left-aligned and clipped in Gecko -- in ways CSS can't reach.
            The real `<input>` is `sr-only`, driven by a button that opens
            its picker via `showPicker()`, so the "Expires {date}" chip is
            ours to size once and have it hold in every engine (`w-56` is
            sized against German's longer phrasing). The date group and
            Share button are `shrink-0`, so email's `sm:flex-1` only
            claims what's left after them, uncapped so it isn't cramped on
            wider containers. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            id="share-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onShare();
            }}
            placeholder={t('category_select.share_invite_placeholder')}
            className={fieldClasses('min-w-0 sm:flex-1')}
          />
          <div className="flex items-center gap-2">
            <div className="flex min-h-11 w-56 shrink-0 items-center rounded-sm bg-card ring-1 ring-inset ring-control-border focus-within:ring-foreground">
              <button
                type="button"
                onClick={openDatePicker}
                title={t('category_select.share_expiry_label')}
                className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-sm py-2 pl-3 pr-2 text-left hover:bg-muted transition-colors"
              >
                <Icon
                  icon={IconType.Calendar}
                  className="w-4 h-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span
                  className={`truncate ${expiryDate ? '' : 'text-muted-foreground'}`}
                >
                  {expiryDate
                    ? t('category_select.share_expiry_chip').replace(
                        '{date}',
                        new Date(`${expiryDate}T00:00:00`).toLocaleDateString(),
                      )
                    : t('category_select.share_no_expiry')}
                </span>
              </button>
              {expiryDate && (
                <button
                  type="button"
                  onClick={() => setExpiryDate('')}
                  aria-label={t('category_select.share_expiry_clear')}
                  title={t('category_select.share_expiry_clear')}
                  className="mr-1.5 shrink-0 rounded-sm p-1 hover:bg-muted transition-colors"
                >
                  <Icon
                    icon={IconType.Close}
                    className="w-3.5 h-3.5"
                    aria-hidden="true"
                  />
                </button>
              )}
            </div>
            <input
              ref={expiryInputRef}
              id="share-expiry"
              type="date"
              value={expiryDate}
              min={todayDateStr()}
              onChange={(e) => setExpiryDate(e.target.value)}
              aria-label={t('category_select.share_expiry_label')}
              className="sr-only"
              tabIndex={-1}
            />
            <IconButton
              variant="primary"
              size="xl"
              onClick={() => void onShare()}
              disabled={email.trim() === '' || isSharing}
              aria-busy={isSharing}
              aria-label={t('category_select.share_confirm')}
              title={t('category_select.share_confirm')}
            >
              {isSharing ? (
                <Spinner size="sm" />
              ) : (
                <Icon
                  icon={IconType.Share}
                  className="w-5 h-5"
                  aria-hidden="true"
                />
              )}
            </IconButton>
          </div>
        </div>
      </div>

      {!isLoading && list.length === 0 && (
        <p className="font-label text-[0.6875rem] text-muted-foreground">
          {t('category_select.share_list_empty')}
        </p>
      )}

      {list.length > 0 && (
        <ul className="flex flex-col divide-y divide-border/60">
          <li className="pb-1.5 font-label text-[0.6875rem] text-muted-foreground">
            {t('category_select.share_list_title')}
          </li>
          {list.map((s) => {
            const isExpired =
              !!s.expires_at &&
              new Date(s.expires_at).getTime() <= new Date().getTime();
            return (
              <li
                key={s.id}
                // Two lines below `sm`: email (plus its role badge), then
                // expiry and the controls -- squeezing all of that onto one
                // narrow row is what let a long email crowd the expiry
                // date out of view entirely. `sm:contents` drops the
                // second line's own box at `sm` and up, promoting its two
                // children back to being direct flex items of this `<li>`
                // so the row returns to one line where there's room for it.
                //
                // No `justify-between` here: with three items (email,
                // expiry, controls) it pins only the first and last to the
                // edges and free-floats the middle one, so the expiry date
                // drifted sideways row to row depending on how much of the
                // row a given email ate. `sm:flex-1` below makes email the
                // one item that absorbs the leftover space instead, so
                // expiry and controls stay a fixed unit flush at the end
                // on every row regardless of email length.
                className="flex flex-col gap-1.5 py-2 pl-2 text-sm sm:flex-row sm:items-center sm:gap-2"
              >
                <div className="flex min-w-0 items-center gap-1.5 sm:flex-1">
                  <span className="truncate min-w-0">{s.invited_email}</span>
                  {/* The role itself carries this now, not the pen button's
                      colour -- a row is scannable without opening anything,
                      and "editor" is the one worth calling out; "viewer" is
                      the default nobody needs flagged. */}
                  {s.role === 'editor' && (
                    <span className="tag-chip shrink-0">
                      {t('category_select.share_role_editor_badge')}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 sm:contents">
                  <span
                    className={`shrink-0 ${isExpired ? 'text-destructive' : 'text-muted-foreground'}`}
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
                    {/* Flat rather than framed: the outline/xl treatment
                        every other IconButton in this section uses read as
                        a much bigger, heavier control than the plain text
                        it sits beside. Same touch target (44px below
                        `sm`), quieter at rest. */}
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
    </div>
  );
}

// Split out to keep the "which share" lookup and title string together,
// rather than inline in the list's JSX.
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
