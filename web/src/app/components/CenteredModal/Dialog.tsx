'use client';

import { useRef } from 'react';
import Icon, { IconType } from '../Icon';
import { useFocusTrap } from './useFocusTrap';

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
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap(open, panelRef, initialFocusRef);

  return (
    <div
      className={`fixed inset-0 z-modal flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] transition-opacity duration-200 ease-out ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      aria-hidden={!open}
      inert={!open}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="centered-modal-title"
        className={`bg-card text-card-foreground ring-1 ring-border rounded-sm shadow-2xl w-full max-w-2xl max-h-[90dvh] flex flex-col overflow-hidden transition-[opacity,transform] duration-200 ease-out ${
          open ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 id="centered-modal-title" className="font-display text-base">
            {title}
          </h3>
          <button
            className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-card-foreground/10"
            onClick={onClose}
            aria-label={closeLabel ?? 'Close'}
          >
            <Icon icon={IconType.Close} className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
