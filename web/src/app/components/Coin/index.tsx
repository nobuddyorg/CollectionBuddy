'use client';

import React, { useId, useMemo } from 'react';

import type { CoinProps } from '../Coin/types';
import { Icon, IconType } from '../Icon/index';
import { TextRing } from './TextRing';

export default function Coin({
  text,
  cta,
  size = 380,
  className,
  textClassName = 'fill-muted-foreground',
  fontFamily = 'var(--font-label-family), monospace',
  fontSize = 15,
  letterSpacing = 4,
  opacity = 1,
}: CoinProps) {
  const rimId = useId();

  // Scales with the viewport instead of pinning a 340px floor, which on a
  // 390px screen left the medallion touching both edges. Caps at `size` so
  // it stops growing once there is room to spare.
  const style = useMemo<React.CSSProperties>(() => {
    const clamped = `clamp(200px, 68vw, ${size}px)`;
    return { width: clamped, height: clamped };
  }, [size]);

  return (
    <div className={`relative ${className ?? ''}`} style={style}>
      <Icon
        icon={IconType.Coin}
        className="w-full h-full"
        rimId={rimId}
        aria-hidden="true"
      >
        <TextRing
          rimId={rimId}
          text={text}
          fontFamily={fontFamily}
          fontSize={fontSize}
          letterSpacing={letterSpacing}
          opacity={opacity}
          className={textClassName}
        />
      </Icon>

      <div className="absolute inset-0 grid place-items-center z-30">{cta}</div>
    </div>
  );
}
