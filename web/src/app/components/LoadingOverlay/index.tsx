'use client';

import React from 'react';

type LoadingOverlayProps = {
  label: string;
  inline?: boolean;
  spinnerSize?: number;
  className?: string;
  zIndex?: number;
  scrim?: boolean;
  ariaLive?: 'polite' | 'assertive' | 'off';
};

export default function LoadingOverlay({
  label,
  inline = false,
  spinnerSize = 32,
  className,
  zIndex = 100,
  scrim = true,
  ariaLive = 'polite',
}: LoadingOverlayProps) {
  const base = 'flex flex-col items-center justify-center gap-3 select-none';

  const fullscreenClasses = [
    'fixed inset-0',
    `z-[${zIndex}]`,
    scrim ? 'bg-black/60 backdrop-blur-sm' : '',
  ].join(' ');

  const inlineClasses =
    'absolute inset-0 bg-black/40 backdrop-blur-[2px] rounded-xl';

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
    >
      <div
        className="animate-spin rounded-full border-2 border-white/80 border-t-transparent"
        style={{ width: spinnerSize, height: spinnerSize }}
        aria-hidden="true"
      />
      <span className="text-white text-lg font-medium">{label}</span>
    </div>
  );
}
