'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export function useMenu() {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(false);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Dismissing with the keyboard is the one case where focus has
        // nowhere sensible to land, so send it back to the trigger.
        restoreFocusRef.current = true;
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Only ever refocus after an Escape. The previous version refocused
  // whenever `open` was false -- including on mount, and after a click
  // outside -- and a programmatic focus() matches :focus-visible, so the
  // trigger picked up a keyboard-style outline it had not earned and kept
  // it until something else was clicked.
  useEffect(() => {
    if (open) return;
    if (!restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    anchorRef.current?.focus();
  }, [open]);

  return { open, toggle, close, anchorRef, panelRef };
}
