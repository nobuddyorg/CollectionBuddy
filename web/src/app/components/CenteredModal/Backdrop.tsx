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
      className={`fixed inset-0 z-[500] bg-black/40 backdrop-blur-sm transition-opacity ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      onClick={onClick}
    />
  );
}
