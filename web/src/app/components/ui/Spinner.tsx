const SIZE_CLASSES = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-8 h-8',
  xl: 'w-10 h-10',
} as const;

export type SpinnerSize = keyof typeof SIZE_CLASSES;

// Inherits currentColor rather than a fixed white -- it used to be
// white-only, which is why the buttons and plates that sit on a pale
// surface each rolled their own currentColor spinner instead of using this
// one (three separate implementations, one of them also duplicated as a
// `.spinner` CSS utility). A caller on a dark surface sets its own text
// colour to white the way it already sets every other icon's colour, same
// as a spinner on any other colour.
export function Spinner({ size = 'md' }: { size?: SpinnerSize }) {
  return (
    <div
      className={`${SIZE_CLASSES[size]} border-2 border-current/40 border-t-current rounded-full animate-spin`}
    />
  );
}
