'use client';

import { useEffect, useRef, useState } from 'react';

export function useMenu() {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(false);

  // Not memoized: both go straight onto elements in a component nothing
  // memoizes, and no effect lists them, so a stable identity buys nothing.
  const close = () => setOpen(false);
  const toggle = () => setOpen((v) => !v);

  useEffect(() => {
    if (!open) return;
    // The trigger is captured here rather than read per click: it is the
    // one element that is always rendered, so holding it keeps this handler
    // from reaching through a ref that a later unmount has already cleared.
    const anchor = anchorRef.current!;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (anchor.contains(t)) return;
      // The panel only exists while the menu is open, so it stays a ref
      // read with its own guard.
      if (panelRef.current && panelRef.current.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Dismissed by keyboard: focus has nowhere sensible to land, so
        // send it back to the trigger.
        restoreFocusRef.current = true;
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Only ever refocus after an Escape: a programmatic focus() matches
  // :focus-visible, so refocusing on every close (including a click
  // outside) gave the trigger a keyboard-style outline it hadn't earned.
  useEffect(() => {
    if (open || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    anchorRef.current!.focus();
  }, [open]);

  return { open, toggle, close, anchorRef, panelRef };
}
