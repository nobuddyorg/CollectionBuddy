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
  /** Radius of the rim path the text is set on, in user units. */
  radius?: number;
};

// The rim path in Icon's CoinIcon is a circle of r=160.
const DEFAULT_RADIUS = 160;

export function TextRing({
  rimId,
  text,
  fontFamily,
  fontSize,
  letterSpacing,
  opacity,
  className,
  radius = DEFAULT_RADIUS,
}: Props) {
  // textLength + lengthAdjust fit the text to one full turn, or it wraps over its own start.
  const circumference = 2 * Math.PI * radius;

  return (
    <text
      fontSize={fontSize}
      className={className}
      style={{ letterSpacing, fontFamily }}
      opacity={opacity}
    >
      <textPath
        href={`#${rimId}`}
        startOffset="0"
        textLength={circumference}
        lengthAdjust="spacing"
      >
        {text}
      </textPath>
    </text>
  );
}
