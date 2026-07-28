'use client';

import React, { memo, useMemo } from 'react';
import type { CollectibleProps } from './types';

type CSSVarStyle = React.CSSProperties & {
  ['--x']?: string;
  ['--y']?: string;
  ['--delay']?: string;
  ['--rot']?: string;
  ['--ink']?: string;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

// A miniature version of the item-card specimen chip -- cream, corner-
// mounted, pinned -- fanned around the login medallion so the very first
// thing a visitor sees already speaks the app's visual language.
function CollectibleComponent({
  delay,
  color,
  emoji,
  x,
  y,
  size = 44,
  className,
  variant = 'float',
}: CollectibleProps) {
  const rot = useMemo(() => {
    let h = 0;
    for (let i = 0; i < x.length + y.length; i++) h = (h * 31 + i) >>> 0;
    return `${((h % 7) - 3) * 1.2}deg`;
  }, [x, y]);

  const style: CSSVarStyle = useMemo(
    () => ({
      width: `${size}px`,
      height: `${size}px`,
      ['--delay']: `${delay}s`,
      ['--x']: x,
      ['--y']: y,
      ['--rot']: rot,
      ['--ink']: color,
    }),
    [size, delay, x, y, rot, color],
  );

  const variantClass = variant === 'bob' ? 'collectible-bob' : 'collectible';

  // Two layers on purpose: the outer div owns the positioning (absolute,
  // fling/bob animation via --x/--y/--rot) while the inner one owns the
  // card look (corner-mount forces position:relative, which would fight
  // the outer div's position:absolute if they were the same element).
  return (
    <div
      className={cx(
        'absolute z-0 select-none pointer-events-none',
        variantClass,
        className,
      )}
      style={style}
      aria-hidden="true"
    >
      <div className="corner-mount w-full h-full rounded-md flex items-center justify-center text-lg bg-card shadow-lg border-2 border-[var(--ink)]">
        <span
          className="pin"
          style={{ top: -9, left: 'calc(50% - 9px)' }}
          aria-hidden="true"
        />
        {emoji}
      </div>
    </div>
  );
}

const Collectible = memo(CollectibleComponent);
Collectible.displayName = 'Collectible';
export default Collectible;
