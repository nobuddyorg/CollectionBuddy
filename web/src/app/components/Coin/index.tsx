'use client';

import React, { useId, useMemo } from 'react';

import type { CoinProps } from './types';
import { CoinIcon } from './CoinIcon';
import { coinSizeCss } from './size';
import { TextRing } from './TextRing';

export default function Coin({ text, cta, size = 420 }: CoinProps) {
  const rimId = useId();

  const style = useMemo<React.CSSProperties>(() => {
    const clamped = coinSizeCss(size);
    return { width: clamped, height: clamped };
  }, [size]);

  return (
    <div data-testid="coin" className="relative" style={style}>
      <CoinIcon rimId={rimId} className="w-full h-full" aria-hidden="true">
        <TextRing rimId={rimId} text={text} />
      </CoinIcon>

      <div className="absolute inset-0 grid place-items-center z-30">{cta}</div>
    </div>
  );
}
