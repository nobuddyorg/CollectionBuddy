'use client';

import React, { useEffect, useState } from 'react';

import { useI18n } from '../../i18n/useI18n';

type LoadingOverlayProps = {
  label: string;
  inline?: boolean;
  spinnerSize?: number;
  className?: string;
  zIndex?: number;
  scrim?: boolean;
  // 'dark' is the hardcoded black scrim/white text used for the OAuth
  // redirect wait, which covers the real page content behind it. 'auto'
  // follows the app's own background/foreground tokens, for overlays
  // (like the initial session check) that are the only thing on screen.
  theme?: 'dark' | 'auto';
  ariaLive?: 'polite' | 'assertive' | 'off';
};

const SLOW_THRESHOLD_MS = 8000;

export default function LoadingOverlay({
  label,
  inline = false,
  spinnerSize = 32,
  className,
  zIndex = 100,
  scrim = true,
  theme = 'dark',
  ariaLive = 'polite',
}: LoadingOverlayProps) {
  const { t } = useI18n();
  const [slow, setSlow] = useState(false);

  // Subscribes state to an external timer -- the canonical use of an effect.
  // The synchronous reset covers `label` changing while already slow (a new
  // wait starting without the overlay unmounting), so the message doesn't
  // stay stuck in the "slow" state for the new wait's first 8s.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlow(false);
    const id = setTimeout(() => setSlow(true), SLOW_THRESHOLD_MS);
    return () => clearTimeout(id);
  }, [label]);

  const isDark = theme === 'dark';
  const base = 'flex flex-col items-center justify-center gap-3 select-none';

  const fullscreenClasses = [
    'fixed inset-0',
    scrim
      ? isDark
        ? 'bg-black/60 backdrop-blur-sm'
        : 'bg-background/80 backdrop-blur-sm'
      : '',
  ].join(' ');

  const inlineClasses = isDark
    ? 'absolute inset-0 bg-black/40 backdrop-blur-[2px] rounded-xl'
    : 'absolute inset-0 bg-background/60 backdrop-blur-[2px] rounded-xl';

  const spinnerClasses = isDark
    ? 'border-white/80 border-t-transparent'
    : 'border-foreground/30 border-t-foreground';

  return (
    <div
      role="status"
      aria-live={ariaLive}
      aria-busy="true"
      className={[
        base,
        inline ? inlineClasses : fullscreenClasses,
        className ?? '',
      ].join(' ')}
      style={inline ? undefined : { zIndex }}
    >
      <div
        className={`animate-spin rounded-full border-2 ${spinnerClasses}`}
        style={{ width: spinnerSize, height: spinnerSize }}
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
