import type React from 'react';

export type CoinProps = {
  text: string;
  cta: React.ReactNode;
  size?: number;
  className?: string;
  textClassName?: string;
  fontFamily?: string;
  fontSize?: number;
  letterSpacing?: number;
  opacity?: number;
};
