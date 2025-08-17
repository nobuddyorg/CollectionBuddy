'use client';

import React, { memo, useMemo } from 'react';
import type { CollectibleProps } from './types';

type CSSVarStyle = React.CSSProperties & {
  ['--x']?: string;
  ['--y']?: string;
  ['--delay']?: string;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

function CollectibleComponent({
  delay,
  color,
  emoji,
  x,
  y,
  size = 32,
  className,
  variant = 'float',
}: CollectibleProps) {
  const style: CSSVarStyle = useMemo(
    () => ({
      width: `${size}px`,
      height: `${size}px`,
      backgroundColor: color,
      ['--delay']: `${delay}s`,
      ['--x']: x,
      ['--y']: y,
    }),
    [size, color, delay, x, y],
  );

  const variantClass = variant === 'bob' ? 'collectible-bob' : 'collectible';

  return (
    <div
      className={cx(
        'absolute flex items-center justify-center rounded-full text-lg text-white/95 shadow z-0 select-none',
        'pointer-events-none',
        variantClass,
        className,
      )}
      style={style}
      aria-hidden="true"
    >
      {emoji}
    </div>
  );
}

const Collectible = memo(CollectibleComponent);
Collectible.displayName = 'Collectible';
export default Collectible;
