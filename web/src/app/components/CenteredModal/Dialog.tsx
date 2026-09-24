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
  /** Rendered above `children` and wired to `aria-describedby`, e.g. a confirm's question. */
  description?: string;
  closeLabel?: string;
  onClose: () => void;
  children: React.ReactNode;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  size?: 'default' | 'full';
  role?: 'dialog' | 'alertdialog';
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Not a constant id: a confirm raised inside another modal would label the wrong dialog.
  const titleId = useId();
  const descriptionId = useId();

  useFocusTrap({ open, containerRef: panelRef, initialFocusRef });

  return (
    <div
      className={`fixed inset-0 z-modal flex items-center justify-center transition-opacity duration-200 ease-out ${
        size === 'full'
          ? 'p-0'
          : 'p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]'
      } ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
    >
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- onClick only stops a click inside the panel from reaching the backdrop's close handler */}
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
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 id={titleId} className="font-display text-base">
            {title}
          </h3>
          <button
            data-testid="dialog-close"
            className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-card-foreground/10"
            onClick={onClose}
            aria-label={closeLabel ?? 'Close'}
          >
            <Icon icon={IconType.Close} className="w-5 h-5" />
          </button>
        </div>
        {/* Fullscreen drops the padding, or 100%-sized content (the map) collapses to nothing. */}
        <div
          className={
            size === 'full'
              ? 'flex-1 min-h-0 overflow-hidden'
              : 'p-4 overflow-auto'
          }
        >
          {description && (
            <p
              id={descriptionId}
              data-testid="dialog-message"
              className="text-sm mb-3"
            >
              {description}
            </p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
