'use client';
export function Backdrop({
  open,
  onClick,
}: {
  open: boolean;
  onClick?: () => void;
}) {
  return (
    // A click-outside-to-close convenience: Escape (useEscapeToClose) and
    // the dialog's own close button already cover the keyboard path, and
    // making a full-screen decorative backdrop focusable/keyboard-operable
    // would be worse for keyboard and screen-reader users, not better.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <div
      className={`fixed inset-0 z-backdrop bg-black/40 backdrop-blur-sm transition-opacity duration-200 ease-out ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      onClick={onClick}
    />
  );
}
