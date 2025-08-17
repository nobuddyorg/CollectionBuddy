'use client';

import type React from 'react';

type Props = {
  rimId: string;
  text: string;
  fontFamily: string;
  fontSize: number;
  letterSpacing: number;
  opacity: number;
  className?: string;
};

export function TextRing({
  rimId,
  text,
  fontFamily,
  fontSize,
  letterSpacing,
  opacity,
  className,
}: Props) {
  return (
    <text
      fontSize={fontSize}
      className={className}
      style={{ letterSpacing, fontFamily }}
      opacity={opacity}
    >
      <textPath href={`#${rimId}`} startOffset="50%" textAnchor="middle">
        {text}
      </textPath>
    </text>
  );
}
