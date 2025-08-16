'use client';
import React from 'react';
import Icon, { IconType } from './Icon';

export default function Coin({
  text,
  cta,
}: {
  text: string;
  cta: React.ReactNode;
}) {
  return (
    <div className="relative w-[340px] h-[340px] sm:w-[380px] sm:h-[380px]">
      <Icon icon={IconType.Coin} className="w-full h-full">
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
      </Icon>
      <div className="absolute inset-0 grid place-items-center z-30">{cta}</div>
    </div>
  );
}
