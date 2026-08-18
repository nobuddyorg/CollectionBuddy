const SIZE_CLASSES = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-8 h-8',
  xl: 'w-10 h-10',
} as const;

export type SpinnerSize = keyof typeof SIZE_CLASSES;

// Inherits currentColor rather than a fixed white, so a caller on a dark
// surface sets its own text colour the same way it sets every other icon's.
export function Spinner({ size = 'md' }: { size?: SpinnerSize }) {
  return (
    <div
      className={`${SIZE_CLASSES[size]} border-2 border-current/40 border-t-current rounded-full animate-spin`}
    />
  );
}
