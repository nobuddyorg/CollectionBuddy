'use client';

import { useCallback, useRef, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import { IconButton } from '../ui/IconButton';
import { Spinner } from '../ui/Spinner';
import { fieldClasses } from '../ui/fieldClasses';
import { labelClasses } from '../ui/labelClasses';
import { MAX_EMAIL_LENGTH } from '../../lib/textLimits';
import type { UseShares } from './useShares';

// End of day, not midnight: midnight would trip category_shares_expiry_in_future for most of the day.
function endOfDayIso(dateString: string): string {
  return new Date(`${dateString}T23:59:59`).toISOString();
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ShareInvite({ shares }: { shares: UseShares }) {
  const { t } = useI18n();
  const { isSharing, createShare } = shares;
  const [email, setEmail] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const expiryInputRef = useRef<HTMLInputElement>(null);

  // typeof, not in: jsdom stubs showPicker as a non-function, and older Safari/Firefox lack it.
  const openDatePicker = useCallback(() => {
    const element = expiryInputRef.current!;
    if (typeof element.showPicker === 'function') {
      element.showPicker();
    } else {
      element.focus();
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
      {/* The date input is sr-only: engines render it too differently, so a button drives showPicker(). */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          id="share-email"
          data-testid="share-email"
          type="email"
          value={email}
          maxLength={MAX_EMAIL_LENGTH}
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void onShare();
          }}
          placeholder={t('category_select.share_invite_placeholder')}
          className={fieldClasses('min-w-0 sm:flex-1')}
        />
        <div className="flex items-center gap-2">
          <div className="flex min-h-11 w-56 shrink-0 items-center rounded-sm bg-card ring-1 ring-inset ring-control-border focus-within:ring-foreground">
            <button
              type="button"
              data-testid="share-expiry"
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
                data-testid="share-expiry-clear"
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
            data-testid="share-expiry-input"
            type="date"
            value={expiryDate}
            min={todayDateString()}
            onChange={(event) => setExpiryDate(event.target.value)}
            aria-label={t('category_select.share_expiry_label')}
            className="sr-only"
            tabIndex={-1}
          />
          <IconButton
            variant="primary"
            size="xl"
            data-testid="share-submit"
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
