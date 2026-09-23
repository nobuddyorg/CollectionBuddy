'use client';

import React, { useEffect, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';

type LoadingOverlayProps = {
  label: string;
  /** 'dark' scrims real page content; 'auto' follows the app tokens when alone on screen. */
  theme?: 'dark' | 'auto';
};

const SLOW_THRESHOLD_MS = 8000;
const SPINNER_SIZE = 32;

export default function LoadingOverlay({
  label,
  theme = 'dark',
}: LoadingOverlayProps) {
  const { t } = useI18n();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset synchronously so a new wait that starts while already slow does not stay slow
    setSlow(false);
    const id = setTimeout(() => setSlow(true), SLOW_THRESHOLD_MS);
    return () => clearTimeout(id);
  }, [label]);

  const isDark = theme === 'dark';
  const base = 'flex flex-col items-center justify-center gap-3 select-none';

  const fullscreenClasses = [
    'fixed inset-0',
    isDark
      ? 'bg-black/60 backdrop-blur-sm'
      : 'bg-background/80 backdrop-blur-sm',
  ].join(' ');

  const spinnerClasses = isDark
    ? 'border-white/80 border-t-transparent'
    : 'border-foreground/30 border-t-foreground';

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={[base, fullscreenClasses].join(' ')}
      style={{ zIndex: 100 }}
    >
      <div
        className={`animate-spin rounded-full border-2 ${spinnerClasses}`}
        style={{ width: SPINNER_SIZE, height: SPINNER_SIZE }}
        aria-hidden="true"
      />
      <span
        className={`text-lg font-medium ${isDark ? 'text-white' : 'text-foreground'}`}
      >
        {label}
      </span>
      {slow && (
        <span
          className={`text-sm ${isDark ? 'text-white/80' : 'text-foreground/70'}`}
        >
          {t('common.loading_slow')}
        </span>
      )}
    </div>
  );
}
