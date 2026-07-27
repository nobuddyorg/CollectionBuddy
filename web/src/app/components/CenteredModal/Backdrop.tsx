'use client';
export function Backdrop({
  open,
  onClick,
}: {
  open: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`fixed inset-0 z-backdrop bg-black/40 backdrop-blur-sm transition-opacity duration-200 ease-out ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      onClick={onClick}
    />
  );
}
