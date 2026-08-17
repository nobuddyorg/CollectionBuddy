'use client';

import { useCallback, useRef, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { useConfirm } from '../Confirm/ConfirmProvider';
import { useToast } from '../Toast/ToastProvider';
import Icon, { IconType } from '../Icon';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';
import { fieldClasses } from '../ui/fieldClasses';
import type { UseShares } from './useShares';

type Props = {
  shares: UseShares;
};

// Local midnight would already be behind `now()` for most of the day a
// grantor picks "today", tripping the category_shares_expiry_in_future
// check constraint (0011_category_shares.sql) on a perfectly reasonable
// choice. End of day gives the whole picked date, the way a person reading
// "expires August 11" would expect.
function endOfDayIso(dateStr: string): string {
  return new Date(`${dateStr}T23:59:59`).toISOString();
}

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Only ever mounted for a category the viewer owns -- a grantee's own grant
// is managed from the panel's existing Delete button (leave), not from
// here. See index.tsx's onDelete.
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

  // Delegates to the native picker instead of reimplementing one: this
  // button exists to give the *trigger* a consistent look across engines
  // (see the block comment below), not to replace the OS's own calendar
  // dialog, its keyboard handling or its mobile affordance. `showPicker`
  // is unsupported in older Safari/Firefox and doesn't exist in jsdom
  // (hence the `typeof` guard rather than an `in` check, which jsdom's
  // stub would still pass) -- focusing the field is what a plain click on
  // it would have done anyway on those.
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
    async (shareId: string, canEdit: boolean) => {
      await updateShareRole(shareId, canEdit ? 'editor' : 'viewer');
    },
    [updateShareRole],
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
            completely differently per engine -- flush-right and
            stretched to fill in Blink, left-aligned and content-sized in
            Gecko, clipped at narrow widths -- and none of it is
            reachable from our CSS (#549, #550, this follow-up, confirmed
            against screenshots from three real browsers). The actual
            `<input>` is `sr-only` now, driven by a button that opens its
            picker via `showPicker()`, so the "Expires {date}" chip is
            ours to size once and have it hold, in every engine, in
            German's longer phrasing too (`w-56` was sized against that,
            the wider of the two locales). The date group and Share
            button are both `shrink-0`, so email's `sm:flex-1` only ever
            claims what's left after they've taken their fixed width --
            capping it as well (tried in an earlier round of this same
            fix) left it looking cramped for no reason on any container
            wide enough to hold both fields comfortably, which is every
            real one. */}
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
        <ul className="flex flex-col gap-1.5">
          <li className="font-label text-[0.6875rem] text-muted-foreground">
            {t('category_select.share_list_title')}
          </li>
          {list.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="truncate min-w-0">
                {s.invited_email}
                <span className="text-muted-foreground">
                  {' · '}
                  {s.expires_at
                    ? t('category_select.share_expires_on').replace(
                        '{date}',
                        new Date(s.expires_at).toLocaleDateString(),
                      )
                    : t('category_select.share_no_expiry')}
                </span>
              </span>
              <label className="flex shrink-0 items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={s.role === 'editor'}
                  onChange={(e) => void onToggleRole(s.id, e.target.checked)}
                  disabled={isUpdatingRole}
                  className="h-4 w-4 rounded-sm ring-1 ring-inset ring-control-border accent-foreground"
                />
                {t('category_select.share_can_edit')}
              </label>
              <IconButton
                variant="outlineDestructive"
                size="md"
                onClick={() => void onRevoke(s.id, s.invited_email)}
                disabled={isRevoking}
                aria-label={t('category_select.share_revoke')}
                title={t('category_select.share_revoke')}
              >
                <Icon
                  icon={IconType.Trash}
                  className="w-4 h-4"
                  aria-hidden="true"
                />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
