'use client';

import { useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
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

  const label = t('passkeys.sign_in');

  return (
    <button
      type="button"
      data-testid="passkey-sign-in"
      onClick={() => void handleClick()}
      disabled={loading}
      aria-label={label}
      title={label}
      aria-busy={loading ? 'true' : 'false'}
      className="flex items-center justify-center w-14 h-14 rounded-full text-foreground hover:bg-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-current disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading ? (
        <Spinner size="lg" />
      ) : (
        <Icon
          icon={IconType.Fingerprint}
          className="w-10 h-10"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
