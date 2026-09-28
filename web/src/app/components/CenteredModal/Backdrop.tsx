'use client';
export function Backdrop({ onClick }: { onClick: () => void }) {
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- decorative click-outside layer; Escape and the close button carry the keyboard path
    <div
      className="fixed inset-0 z-backdrop bg-black/40 backdrop-blur-sm"
      onClick={onClick}
    />
  );
}
