'use client';

import { RIM_RADIUS } from './CoinIcon';

type Props = {
  rimId: string;
  text: string;
};

export function TextRing({ rimId, text }: Props) {
  // textLength + lengthAdjust fit the text to one full turn, or it wraps over its own start.
  const circumference = 2 * Math.PI * RIM_RADIUS;

  return (
    <text
      fontSize={15}
      className="fill-muted-foreground"
      style={{
        letterSpacing: 4,
        fontFamily: 'var(--font-label-family), monospace',
      }}
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
