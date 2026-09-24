'use client';

import { useEffect } from 'react';

import { getFocusable } from './getFocusable';

export function useFocusTrap({
  open,
  containerRef,
  initialFocusRef,
}: {
  open: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    (
      initialFocusRef?.current ?? getFocusable(containerRef.current)[0]
    )?.focus();
    return () => {
      // A confirmed delete may have removed the opener from the DOM, making focus() a silent no-op.
      if (previous!.isConnected) {
        previous!.focus();
      } else {
        document.getElementById('main-content')?.focus();
      }
    };
  }, [open, containerRef, initialFocusRef]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const focusable = getFocusable(containerRef.current);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, containerRef]);
}
