const SIZE_CLASSES = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
} as const;

export type SpinnerSize = keyof typeof SIZE_CLASSES;

export function Spinner({ size = 'md' }: { size?: SpinnerSize }) {
  return (
    <div
      className={`${SIZE_CLASSES[size]} border-2 border-white/40 border-t-white rounded-full animate-spin`}
    />
  );
}
