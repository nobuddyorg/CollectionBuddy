'use client';

import { useEffect } from 'react';

import { getFocusable } from './getFocusable';

export function useFocusTrap(
  open: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
  initialFocusRef?: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    (
      initialFocusRef?.current ?? getFocusable(containerRef.current)[0]
    )?.focus();
    return () => {
      // A confirmed delete can remove the control that opened the dialog
      // (e.g. a card's trash button) from the DOM first, making
      // `prev.focus()` a silent no-op; fall back to the stable main
      // landmark instead of dropping focus on the floor.
      if (prev?.isConnected) {
        prev.focus?.();
      } else {
        document.getElementById('main-content')?.focus();
      }
    };
  }, [open, containerRef, initialFocusRef]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const f = getFocusable(containerRef.current);
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
  }, [open, containerRef]);
}
