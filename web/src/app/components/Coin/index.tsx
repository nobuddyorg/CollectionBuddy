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
  textClassName = 'fill-neutral-400 dark:fill-neutral-500',
  fontFamily = "'Courier New', monospace",
  fontSize = 16,
  letterSpacing = 4,
  opacity = 0.9,
}: CoinProps) {
  const rimId = useId();

  // Responsive clamp: small screens fall back to ~340px like your original
  const style = useMemo<React.CSSProperties>(() => {
    const clamped = `clamp(340px, ${size}px, ${size}px)`;
    return { width: clamped, height: clamped };
  }, [size]);

  return (
    <div
      className={`relative ${className ?? ''}`}
      style={style}
      aria-hidden="true"
    >
      <Icon icon={IconType.Coin} className="w-full h-full" rimId={rimId}>
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
