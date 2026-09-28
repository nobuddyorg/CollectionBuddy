'use client';

import React, { memo, useMemo } from 'react';
import type { CollectibleProps } from './types';

type CSSVarStyle = React.CSSProperties & {
  ['--x']?: string;
  ['--y']?: string;
  ['--delay']?: string;
};

const SIZE_PX = 44;

// Grayscaled: bright emoji would bring their own color into an achromatic system.
function CollectibleComponent({ delay, emoji, x, y }: CollectibleProps) {
  const style: CSSVarStyle = useMemo(
    () => ({
      width: `${SIZE_PX}px`,
      height: `${SIZE_PX}px`,
      ['--delay']: `${delay}s`,
      ['--x']: x,
      ['--y']: y,
    }),
    [delay, x, y],
  );

  return (
    <div
      data-testid="collectible"
      className="collectible-bob absolute z-0 select-none pointer-events-none"
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
