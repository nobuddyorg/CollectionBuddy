'use client';

import { useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import { buttonClasses } from '../ui/buttonClasses';
import { Spinner } from '../ui/Spinner';
import type { PasskeySignInButtonProps } from './types';

export default function PasskeySignInButton({
  onClick,
  onError,
}: PasskeySignInButtonProps) {
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  // Unlike Google's redirect, a dismissed prompt resolves on this page, so loading always ends here.
  const handleClick = async () => {
    setLoading(true);
    try {
      await onClick();
    } catch (error) {
      onError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      data-testid="passkey-sign-in"
      onClick={() => void handleClick()}
      disabled={loading}
      aria-busy={loading ? 'true' : 'false'}
      className={buttonClasses(
        'inline-flex items-center gap-2 bg-background disabled:opacity-60 disabled:cursor-not-allowed',
      )}
    >
      {loading ? (
        <Spinner size="sm" />
      ) : (
        <Icon
          icon={IconType.Fingerprint}
          className="w-4 h-4"
          aria-hidden="true"
        />
      )}
      {t('passkeys.sign_in')}
    </button>
  );
}
