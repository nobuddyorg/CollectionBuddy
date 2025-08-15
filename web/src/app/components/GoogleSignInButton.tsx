'use client';
import { useState } from 'react';
import LoadingOverlay from './LoadingOverlay';
import { useI18n } from '../hooks/useI18n';
import Icon, { IconType } from './Icon';

export default function GoogleSignInButton({
  onClick,
}: {
  onClick: () => Promise<unknown> | void;
}) {
  const [loading, setLoading] = useState(false);
  const { t } = useI18n();

  const handleClick = async () => {
    setLoading(true);
    try {
      await onClick();
    } catch {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        aria-label={t('google_sign_in_button.sign_in_with_google')}
        className="relative flex items-center justify-center rounded-md border border-[#747775] dark:border-neutral-500 bg-white hover:bg-[#f8f9fa] active:bg-[#f1f3f4] dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:active:bg-neutral-600 px-4 h-12 shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ fontFamily: 'Roboto, sans-serif', fontWeight: 500 }}
      >
        {!loading && (
          <>
            <Icon
              icon={IconType.Google}
              className="w-5 h-5 mr-3 flex-shrink-0"
            />
            <span className="text-[#3c4043] dark:text-neutral-100 text-sm">
              {t('google_sign_in_button.sign_in_with_google')}
            </span>
          </>
        )}
      </button>

      {loading && <LoadingOverlay />}
    </>
  );
}
