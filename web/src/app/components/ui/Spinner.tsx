const SIZE_CLASSES = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-8 h-8',
  xl: 'w-10 h-10',
} as const;

export type SpinnerSize = keyof typeof SIZE_CLASSES;

// currentColor: it must stay visible on pale and dark surfaces alike.
export function Spinner({ size = 'md' }: { size?: SpinnerSize }) {
  return (
    <div
      className={`${SIZE_CLASSES[size]} border-2 border-current/40 border-t-current rounded-full animate-spin`}
    />
  );
}

export function StatusSpinner({
  size,
  label,
}: {
  size?: SpinnerSize;
  label: string;
}) {
  return (
    <span role="status" aria-label={label}>
      <Spinner size={size} />
    </span>
  );
}
