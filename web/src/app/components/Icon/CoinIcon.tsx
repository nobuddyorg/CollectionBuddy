import React from 'react';

type CoinIconProps = React.SVGProps<SVGSVGElement> & {
  rimId?: string;
  children?: React.ReactNode;
};

export function CoinIcon({ rimId, children, ...props }: CoinIconProps) {
  return (
    <svg viewBox="0 0 380 380" {...props}>
      <defs>
        <path
          id={rimId ?? 'rimTextPath'}
          d="M190,190 m-160,0 a160,160 0 1,1 320,0 a160,160 0 1,1 -320,0"
        />
      </defs>

      <circle
        cx="190"
        cy="190"
        r="180"
        fill="none"
        className="stroke-foreground/30"
        strokeWidth="3"
        strokeDasharray="6 4"
        opacity="0.85"
      />
      <circle
        cx="190"
        cy="190"
        r="153"
        fill="none"
        className="stroke-foreground/30"
        strokeWidth="1.5"
        strokeDasharray="3 3"
        opacity="0.6"
      />

      <g
        transform="translate(190,135) scale(0.65,0.85)"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity="0.9"
        className="stroke-foreground/30"
      >
        <path d="M-128 0 L0 -64 L128 0 Z" />
        <line x1="-140" y1="0" x2="140" y2="0" />
        <line x1="-140" y1="10" x2="140" y2="10" />
        <rect x="-90" y="10" width="36" height="120" rx="4" />
        <rect x="-18" y="10" width="36" height="120" rx="4" />
        <rect x="54" y="10" width="36" height="120" rx="4" />
        <line x1="-82" y1="20" x2="-82" y2="122" opacity=".5" />
        <line x1="-72" y1="20" x2="-72" y2="122" opacity=".5" />
        <line x1="-62" y1="20" x2="-62" y2="122" opacity=".5" />
        <line x1="-10" y1="20" x2="-10" y2="122" opacity=".5" />
        <line x1="0" y1="20" x2="0" y2="122" opacity=".5" />
        <line x1="10" y1="20" x2="10" y2="122" opacity=".5" />
        <line x1="62" y1="20" x2="62" y2="122" opacity=".5" />
        <line x1="72" y1="20" x2="72" y2="122" opacity=".5" />
        <line x1="82" y1="20" x2="82" y2="122" opacity=".5" />
        <rect x="-150" y="132" width="300" height="22" />
        <rect x="-160" y="154" width="320" height="14" />
        <line x1="-170" y1="168" x2="170" y2="168" />
      </g>

      {children}
    </svg>
  );
}
