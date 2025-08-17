'use client';

import { useCallback, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon/index';
import LoadingOverlay from '../LoadingOverlay';
import Spinner from './Spinner';
import type { GoogleSignInButtonProps } from './types';

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

export default function GoogleSignInButton({
  onClick,
  className,
  disabled,
  withOverlay = true,
  mode = 'oauth',
  label,
  onError,
}: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  const finalLabel = label ?? t('google_sign_in_button.sign_in_with_google');

  const handleClick = useCallback(async () => {
    if (loading || disabled) return;
    setLoading(true);
    try {
      await onClick();
      if (mode === 'inline') setLoading(false);
    } catch (err) {
      setLoading(false);
      onError?.(err);
    }
  }, [loading, disabled, onClick, onError, mode]);

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || loading}
        aria-label={finalLabel}
        aria-busy={loading ? 'true' : 'false'}
        className={cx(
          'relative flex items-center justify-center h-12 px-4 rounded-md',
          'border border-[#747775] dark:border-neutral-500',
          'bg-white hover:bg-[#f8f9fa] active:bg-[#f1f3f4]',
          'dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:active:bg-neutral-600',
          'shadow-sm hover:shadow-md transition-all duration-200',
          'disabled:opacity-60 disabled:cursor-not-allowed',
          className,
        )}
        style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 500 }}
      >
        {loading ? (
          <span className="flex items-center gap-3 text-[#3c4043] dark:text-neutral-100 text-sm">
            <Spinner />
            <span>{finalLabel}</span>
          </span>
        ) : (
          <span className="flex items-center">
            <Icon
              icon={IconType.Google}
              className="w-5 h-5 mr-3 flex-shrink-0"
            />
            <span className="text-[#3c4043] dark:text-neutral-100 text-sm">
              {finalLabel}
            </span>
          </span>
        )}
      </button>

      {withOverlay && loading && mode === 'oauth' && (
        <LoadingOverlay label={t('item_list.loading')} />
      )}
    </>
  );
}
