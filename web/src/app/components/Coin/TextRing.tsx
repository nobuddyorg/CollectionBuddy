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

// The rim path in Icon's Coin case is a circle of r=160.
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
  // Fit the string to exactly one full turn, or it flows past the end of
  // the path and wraps over its own start, clipping mid-glyph. `textLength`
  // + `lengthAdjust="spacing"` distributes the slack between characters
  // instead, so the engraving closes cleanly.
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
