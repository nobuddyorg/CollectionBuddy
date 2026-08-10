'use client';

import { useCallback, useEffect, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';
import Icon, { IconType } from '../Icon';
import LoadingOverlay from '../LoadingOverlay';
import Spinner from './Spinner';
import type { GoogleSignInButtonProps } from './types';

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(' ');
}

export default function GoogleSignInButton({
  onClick,
  onError,
}: GoogleSignInButtonProps) {
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  const label = t('google_sign_in_button.sign_in_with_google');

  // `loading` is deliberately never cleared on success -- the redirect is
  // meant to unmount this page. But a bfcache restore (the user presses Back
  // from Google's consent screen) resurrects that stale `loading: true` with
  // no redirect coming, leaving the full-screen overlay stuck with no way to
  // dismiss it. `pageshow`'s `persisted` flag is exactly that signal.
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setLoading(false);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const handleClick = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onClick();
    } catch (err) {
      setLoading(false);
      onError?.(err);
    }
  }, [loading, onClick, onError]);

  return (
    <>
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={loading}
        aria-label={label}
        aria-busy={loading ? 'true' : 'false'}
        className={cx(
          'relative flex items-center justify-center h-12 px-4 rounded-md',
          'border border-[#747775] dark:border-[#8e918f]',
          'bg-white hover:bg-[#f8f9fa] active:bg-[#f1f3f4]',
          'dark:bg-[#131314] dark:hover:bg-[#1e1f20] dark:active:bg-[#282a2c]',
          'shadow-sm hover:shadow-md transition-all duration-200',
          'disabled:opacity-60 disabled:cursor-not-allowed',
        )}
        style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 500 }}
      >
        {loading ? (
          <span className="flex items-center gap-3 text-[#3c4043] dark:text-[#e3e3e3] text-sm">
            <Spinner />
            <span>{label}</span>
          </span>
        ) : (
          <span className="flex items-center">
            <Icon
              icon={IconType.Google}
              className="w-5 h-5 mr-3 flex-shrink-0"
            />
            <span className="text-[#3c4043] dark:text-[#e3e3e3] text-sm">
              {label}
            </span>
          </span>
        )}
      </button>

      {loading && (
        <LoadingOverlay label={t('item_list.loading')} theme="auto" />
      )}
    </>
  );
}
