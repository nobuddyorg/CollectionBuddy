'use client';
import React from 'react';

type CSSVarStyle = React.CSSProperties & {
  ['--x']?: string;
  ['--y']?: string;
  ['--delay']?: string;
};

export type CollectibleProps = {
  delay: number;
  color: string;
  emoji: string;
  x: string;
  y: string;
};

export default function Collectible({
  delay,
  color,
  emoji,
  x,
  y,
}: CollectibleProps) {
  const style: CSSVarStyle = {
    width: '32px',
    height: '32px',
    backgroundColor: color,
    ['--delay']: `${delay}s`,
    ['--x']: x,
    ['--y']: y,
  };
  return (
    <div
      className="absolute collectible flex items-center justify-center rounded-full text-lg text-white/95 shadow z-0 pointer-events-none"
      style={style}
    >
      {emoji}
    </div>
  );
}
