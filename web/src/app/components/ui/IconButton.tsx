'use client';

import type { ButtonHTMLAttributes } from 'react';

const SIZE_CLASSES = {
  sm: 'w-8 h-8',
  md: 'w-9 h-9 max-sm:w-11 max-sm:h-11',
  lg: 'w-10 h-10',
} as const;

const VARIANT_CLASSES = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
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
      className={`${SIZE_CLASSES[size]} flex items-center justify-center rounded-sm transition-opacity ${VARIANT_CLASSES[variant]} ${className}`.trim()}
      {...props}
    />
  );
}
