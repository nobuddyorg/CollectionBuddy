'use client';

import { useCallback, useRef, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';
import { fieldClasses } from '../ui/fieldClasses';
import { labelClasses } from '../ui/labelClasses';
import type { UseShares } from './useShares';

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

// A grant is always issued at the `viewer` role; promoting one to `editor`
// happens from the list beside this, on a row that already exists.
export function ShareInvite({ shares }: { shares: UseShares }) {
  const { t } = useI18n();
  const { isSharing, createShare } = shares;
  const [email, setEmail] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const expiryInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="share-email" className={labelClasses()}>
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
  );
}
