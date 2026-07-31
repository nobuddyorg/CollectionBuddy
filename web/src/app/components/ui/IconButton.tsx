'use client';

import type { ButtonHTMLAttributes } from 'react';

const SIZE_CLASSES = {
  sm: 'w-8 h-8',
  md: 'w-9 h-9 max-sm:w-11 max-sm:h-11',
  lg: 'w-10 h-10',
} as const;

// A drawn box rather than a filled one. Three filled ink squares on every
// card would out-shout the photographs; a hairline frame still reads
// unmistakably as a control, which bare glyphs on the card did not.
//
// The frame is permanent but faint where there is no hover to reveal it --
// on a phone an outline that only appears on hover never appears at all,
// and these buttons exist because the actions were invisible on mobile in
// the first place. Pointer devices get a clean, frameless resting card and
// the full frame under the cursor. Keyboard users are covered by the
// global :focus-visible outline either way.
//
// Ring colour is only ever changed inside `[@media(hover:hover)]` so the
// variants stack in a predictable order; mixing plain `hover:` overrides
// in here would leave which rule wins up to Tailwind's sort order.
const OUTLINE_BASE =
  'bg-card text-muted-foreground ring-1 ring-border/60 [@media(hover:hover)]:ring-transparent';

const VARIANT_CLASSES = {
  primary: 'bg-primary text-primary-foreground hover:opacity-90',
  destructive: 'bg-destructive text-destructive-foreground hover:opacity-90',
  outline: `${OUTLINE_BASE} hover:bg-muted hover:text-foreground [@media(hover:hover)]:hover:ring-border`,
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
  return `${SIZE_CLASSES[size]} flex items-center justify-center rounded-sm transition ${VARIANT_CLASSES[variant]} ${className}`.trim();
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
