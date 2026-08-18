'use client';

import { useId, useRef } from 'react';
import Icon, { IconType } from '../Icon';
import { useFocusTrap } from './useFocusTrap';

export function Dialog({
  open,
  title,
  description,
  closeLabel,
  onClose,
  children,
  initialFocusRef,
  size = 'default',
  role = 'dialog',
}: {
  open: boolean;
  title: string;
  /** Rendered above `children` and wired to `aria-describedby`, for content
   *  that isn't just the dialog's label (e.g. a confirm's question). */
  description?: string;
  closeLabel?: string;
  onClose: () => void;
  children: React.ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  size?: 'default' | 'full';
  role?: 'dialog' | 'alertdialog';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // A constant id breaks once two CenteredModals are mounted at once (a
  // confirm raised from inside another modal): aria-labelledby would
  // resolve to whichever dialog mounted first.
  const titleId = useId();
  const descriptionId = useId();

  useFocusTrap(open, panelRef, initialFocusRef);

  return (
    <div
      className={`fixed inset-0 z-modal flex items-center justify-center transition-opacity duration-200 ease-out ${
        size === 'full'
          ? 'p-0'
          : 'p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]'
      } ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`bg-card text-card-foreground ring-1 ring-border shadow-2xl w-full flex flex-col overflow-hidden transition-[opacity,transform] duration-200 ease-out ${
          size === 'full'
            ? 'h-[100dvh] max-w-none rounded-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]'
            : 'max-w-2xl max-h-[90dvh] rounded-sm'
        } ${open ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 id={titleId} className="font-display text-base">
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
        {/* Fullscreen drops the padding so content sized to 100% (the map)
            fills the screen rather than collapsing to nothing. */}
        <div
          className={
            size === 'full'
              ? 'flex-1 min-h-0 overflow-hidden'
              : 'p-4 overflow-auto'
          }
        >
          {description && (
            <p id={descriptionId} className="text-sm mb-3">
              {description}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
