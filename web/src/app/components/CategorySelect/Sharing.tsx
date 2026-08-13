'use client';

import { useCallback, useState } from 'react';

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
    createShare,
    deleteShare,
  } = shares;
  const [email, setEmail] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

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
        {/* Own row below `sm`: a native date input's rendered width isn't
            fixed by its className alone -- it swings with its value (an
            empty input draws narrower than a filled one), which used to
            fight an `auto` grid track and squeeze the email field on every
            date pick. The `w-44` wrapper below pins the track so that swing
            can't propagate -- putting the width on a wrapper instead of the
            input itself, since `fieldClasses` already bakes in `w-full` and
            two same-specificity width utilities don't reliably resolve by
            their order in the className string. `w-36` clipped the date on
            desktop, where the browser's own calendar-icon affordance eats
            into the same padded box that `mm/dd/yyyy` needs (#549); `w-44`
            leaves it room. Stacking here also gives the email field room to
            breathe on a phone instead of the three controls fighting over
            one row. */}
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
            <div className="w-44 shrink-0">
              <input
                id="share-expiry"
                type="date"
                value={expiryDate}
                min={todayDateStr()}
                onChange={(e) => setExpiryDate(e.target.value)}
                aria-label={t('category_select.share_expiry_label')}
                title={t('category_select.share_expiry_label')}
                className={fieldClasses()}
              />
            </div>
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
