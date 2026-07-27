'use client';

import type { ButtonHTMLAttributes } from 'react';

const SIZE_CLASSES = {
  sm: 'w-8 h-8',
  md: 'w-9 h-9',
  lg: 'w-10 h-10',
} as const;

const VARIANT_CLASSES = {
  primary: 'bg-primary text-primary-foreground shadow-sm hover:brightness-110',
  destructive:
    'bg-destructive text-destructive-foreground shadow-sm hover:brightness-110',
} as const;

export type IconButtonSize = keyof typeof SIZE_CLASSES;
export type IconButtonVariant = keyof typeof VARIANT_CLASSES;

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
};

export function IconButton({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={`${SIZE_CLASSES[size]} flex items-center justify-center rounded-xl ${VARIANT_CLASSES[variant]} ${className}`.trim()}
      {...props}
    />
  );
}
