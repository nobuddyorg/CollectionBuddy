"use client";
import React from "react";

export default function Coin({ text, cta }: { text: string; cta: React.ReactNode }) {
  return (
    <div className="relative w-[340px] h-[340px] sm:w-[380px] sm:h-[380px]">
      <svg viewBox="0 0 380 380" className="w-full h-full">
        <defs>
          <path
            id="rimTextPath"
            d="M190,190 m-160,0 a160,160 0 1,1 320,0 a160,160 0 1,1 -320,0"
          />
        </defs>

        <circle
          cx="190"
          cy="190"
          r="180"
          fill="none"
          className="stroke-neutral-300 dark:stroke-neutral-700"
          strokeWidth="3"
          strokeDasharray="6 4"
          opacity="0.85"
        />
        <circle
          cx="190"
          cy="190"
          r="153"
          fill="none"
          className="stroke-neutral-300 dark:stroke-neutral-700"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          opacity="0.6"
        />

        <text
          fontSize="16"
          className="fill-neutral-400 dark:fill-neutral-500"
          style={{ letterSpacing: 4, fontFamily: "'Courier New', monospace" }}
          opacity="0.9"
        >
          <textPath href="#rimTextPath" startOffset="50%" textAnchor="middle">
            {text}
          </textPath>
        </text>

        <g
          transform="translate(190,135) scale(0.65,0.85)"
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity="0.9"
          className="stroke-neutral-300 dark:stroke-neutral-700"
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
      </svg>
      <div className="absolute inset-0 grid place-items-center z-30">{cta}</div>
    </div>
  );
}
