'use client';

import { useEffect, useRef, useState } from 'react';

export function useMenu() {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(false);

  // Not memoized: nothing downstream memoizes them or lists them in an effect.
  const close = () => setOpen(false);
  const toggle = () => setOpen((value) => !value);

  useEffect(() => {
    if (!open) return;
    // Captured once: the anchor is always rendered, so a later unmount cannot clear it mid-handler.
    const anchor = anchorRef.current!;
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchor.contains(target)) return;
      // The panel exists only while open, so it stays a guarded ref read.
      if (panelRef.current && panelRef.current.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocumentClick);
    return () => document.removeEventListener('mousedown', onDocumentClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Dismissed by keyboard, focus has nowhere sensible to land but the trigger.
        restoreFocusRef.current = true;
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Only after Escape: programmatic focus() matches :focus-visible, so a click would earn an outline.
  useEffect(() => {
    if (open || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    anchorRef.current!.focus();
  }, [open]);

  return { open, toggle, close, anchorRef, panelRef };
}
