'use client';

import { useId, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import { usePasskeySupport } from '../../lib/usePasskeySupport';
import Icon, { IconType } from '../Icon';
import { iconButtonClasses } from '../ui/IconButton';
import { StatusSpinner } from '../ui/Spinner';
import { usePasskeys } from './usePasskeys';

const ROW_BUTTON =
  'flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted transition-colors disabled:opacity-60';

/** Fingerprint sign-in: saves a passkey for this account and lists the saved ones, so a lost device can be removed. */
export function PasskeySetting() {
  const { t } = useI18n();
  const supported = usePasskeySupport();
  const { list, busy, add, remove } = usePasskeys();
  const hintId = useId();
  const [hintOpen, setHintOpen] = useState(false);

  return (
    <div data-testid="passkey-setting" className="px-3 py-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-sm">{t('passkeys.heading')}</span>
        {supported && (
          <button
            type="button"
            data-testid="passkey-add"
            disabled={busy}
            onClick={() => void add()}
            aria-label={t('passkeys.add')}
            title={t('passkeys.add')}
            className={ROW_BUTTON}
          >
            <Icon
              icon={IconType.Fingerprint}
              className="h-5 w-5"
              aria-hidden="true"
            />
          </button>
        )}
        <button
          type="button"
          data-testid="passkey-info"
          aria-label={t('passkeys.info_label')}
          aria-expanded={hintOpen}
          aria-controls={hintId}
          onClick={() => setHintOpen((open) => !open)}
          className={ROW_BUTTON}
        >
          <Icon icon={IconType.Info} className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <p
        id={hintId}
        hidden={!hintOpen}
        data-testid="passkey-hint"
        className="text-xs text-muted-foreground"
      >
        {t('passkeys.hint')}
      </p>

      {list.status === 'loading' && (
        <StatusSpinner size="sm" label={t('common.loading')} />
      )}
      {list.status === 'failed' && (
        <p role="alert" className="text-xs text-destructive">
          {t('passkeys.list_error')}
        </p>
      )}
      {list.status === 'ready' && list.passkeys.length > 0 && (
        <ul data-testid="passkey-list" className="space-y-1">
          {list.passkeys.map((passkey) => {
            const name = passkey.friendly_name || t('passkeys.unnamed');
            return (
              <li
                key={passkey.id}
                data-testid="passkey"
                className="flex items-center gap-2 text-xs"
              >
                <span className="flex-1 truncate">{name}</span>
                <button
                  type="button"
                  data-testid="passkey-remove"
                  disabled={busy}
                  onClick={() => void remove(passkey.id)}
                  aria-label={t('passkeys.remove', { name })}
                  className={iconButtonClasses({
                    variant: 'outlineDestructive',
                    size: 'sm',
                  })}
                >
                  <Icon
                    icon={IconType.Trash}
                    className="w-4 h-4"
                    aria-hidden="true"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
