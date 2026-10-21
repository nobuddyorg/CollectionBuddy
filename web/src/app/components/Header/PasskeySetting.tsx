'use client';

import { useI18n } from '../../i18n/useI18n';
import { usePasskeySupport } from '../../lib/usePasskeySupport';
import Icon, { IconType } from '../Icon';
import { iconButtonClasses } from '../ui/IconButton';
import { StatusSpinner } from '../ui/Spinner';
import { usePasskeys } from './usePasskeys';

/** Fingerprint sign-in: saves a passkey for this account and lists the saved ones, so a lost device can be removed. */
export function PasskeySetting() {
  const { t } = useI18n();
  const supported = usePasskeySupport();
  const { list, busy, add, remove } = usePasskeys();

  return (
    <div data-testid="passkey-setting" className="px-3 py-2 space-y-1.5">
      <span className="block text-sm">{t('passkeys.heading')}</span>
      <p className="text-xs text-muted-foreground">{t('passkeys.hint')}</p>

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

      {supported && (
        <button
          type="button"
          data-testid="passkey-add"
          disabled={busy}
          onClick={() => void add()}
          className="w-full flex items-center gap-2 px-2 min-h-9 rounded-sm ring-1 ring-inset ring-control-border hover:bg-muted text-xs transition-colors disabled:opacity-60"
        >
          <Icon
            icon={IconType.Fingerprint}
            className="w-4 h-4"
            aria-hidden="true"
          />
          {t('passkeys.add')}
        </button>
      )}
    </div>
  );
}
