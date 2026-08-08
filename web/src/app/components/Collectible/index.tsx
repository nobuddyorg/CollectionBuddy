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

// A collected object drifting near the medallion. Grayscaled rather than
// left in full color: a ring of cartoon-bright emoji was the interface
// supplying its own colour, which is the one thing this achromatic system
// never does -- the accent wordmark is the single deliberate exception, and
// these chips competed with it instead of sitting quietly behind it.
function CollectibleComponent({
  delay,
  emoji,
  x,
  y,
  size = 44,
  className,
}: CollectibleProps) {
  // Two layers: the outer element owns positioning and the fling/bob
  // animation, the inner one owns the chip's look.
  const style: CSSVarStyle = useMemo(
    () => ({
      width: `${size}px`,
      height: `${size}px`,
      ['--delay']: `${delay}s`,
      ['--x']: x,
      ['--y']: y,
    }),
    [size, delay, x, y],
  );

  return (
    <div
      className={cx(
        'collectible-bob absolute z-0 select-none pointer-events-none',
        className,
      )}
      style={style}
      aria-hidden="true"
    >
      <div className="w-full h-full rounded-full bg-card ring-1 ring-border shadow-sm flex items-center justify-center text-xl grayscale contrast-125">
        {emoji}
      </div>
    </div>
  );
}

const Collectible = memo(CollectibleComponent);
Collectible.displayName = 'Collectible';
export default Collectible;
