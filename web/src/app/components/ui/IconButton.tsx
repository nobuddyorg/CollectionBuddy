'use client';

import type { ButtonHTMLAttributes } from 'react';

const SIZE_CLASSES = {
  sm: 'w-8 h-8',
  md: 'w-9 h-9 max-sm:w-11 max-sm:h-11',
  lg: 'w-10 h-10',
  // Matches the min-h-11 form controls elsewhere.
  xl: 'w-11 h-11',
} as const;

// Faint but permanent frame, not hover-only: on a phone a hover-only
// outline never appears at all, and these buttons exist because the
// actions were invisible on mobile without one.
//
// Ring colour only ever changes inside `[@media(hover:hover)]` so the
// variants stack predictably -- mixing in plain `hover:` overrides would
// leave which rule wins up to Tailwind's sort order.
const OUTLINE_BASE =
  'bg-card text-muted-foreground ring-1 ring-control-border/60 [@media(hover:hover)]:ring-transparent';

const VARIANT_CLASSES = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
  outline: `${OUTLINE_BASE} hover:bg-muted hover:text-foreground [@media(hover:hover)]:hover:ring-control-border`,
  outlineDestructive: `${OUTLINE_BASE} hover:bg-destructive/10 hover:text-destructive [@media(hover:hover)]:hover:ring-destructive/40`,
} as const;

export type IconButtonSize = keyof typeof SIZE_CLASSES;
export type IconButtonVariant = keyof typeof VARIANT_CLASSES;

/** Shared so non-button controls -- a file-input `<label>` -- can match. */
export function iconButtonClasses({
  variant = 'primary',
  size = 'md',
  className = '',
}: {
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  className?: string;
} = {}) {
  // disabled:pointer-events-none: :hover doesn't care about the disabled
  // attribute, so a merely-dimmed button would still trigger hover:* above.
  return `${SIZE_CLASSES[size]} flex items-center justify-center rounded-sm transition disabled:pointer-events-none ${VARIANT_CLASSES[variant]} ${className}`.trim();
}

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
      className={iconButtonClasses({ variant, size, className })}
      {...props}
    />
  );
}
