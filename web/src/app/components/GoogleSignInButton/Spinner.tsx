'use client';
export default function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block w-5 h-5 border-2 border-transparent border-t-current rounded-full animate-spin"
    />
  );
}
