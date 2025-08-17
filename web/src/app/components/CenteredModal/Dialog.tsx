'use client';

import { useEffect, useRef } from 'react';

function getFocusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  return Array.from(container.querySelectorAll<HTMLElement>(selectors));
}

export function Dialog({
  open,
  title,
  closeLabel,
  onClose,
  children,
  initialFocusRef,
}: {
  open: boolean;
  title: string;
  closeLabel?: string;
  onClose: () => void;
  children: React.ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = initialFocusRef?.current ?? getFocusable(panelRef.current)[0];
    el?.focus?.();
  }, [open, initialFocusRef]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const f = getFocusable(panelRef.current);
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <div
      className={`fixed inset-0 z-[600] flex items-center justify-center p-4 transition-opacity ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      aria-hidden={!open}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="centered-modal-title"
        className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 id="centered-modal-title" className="text-base font-semibold">
            {title}
          </h3>
          <button
            className="rounded-md px-3 py-1 text-sm border"
            onClick={onClose}
            aria-label={closeLabel ?? 'Close'}
          >
            {closeLabel ?? 'Close'}
          </button>
        </div>
        <div className="p-4 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
