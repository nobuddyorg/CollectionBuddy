'use client';

import React, { memo, useMemo } from 'react';
import type { CollectibleProps } from './types';

type CSSVarStyle = React.CSSProperties & {
  ['--x']?: string;
  ['--y']?: string;
  ['--delay']?: string;
};

function joinClasses(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

// Grayscaled: bright emoji would bring their own color into an achromatic system.
function CollectibleComponent({
  delay,
  emoji,
  x,
  y,
  size = 44,
  className,
}: CollectibleProps) {
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
      data-testid="collectible"
      className={joinClasses(
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
