'use client';

import { useEffect, useRef, useState } from 'react';

export function useMenu() {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef(false);

  const close = () => setOpen(false);
  const toggle = () => setOpen((value) => !value);

  useEffect(() => {
    if (!open) return;
    // Captured once: both are mounted while open, so a later unmount cannot clear them mid-handler.
    const anchor = anchorRef.current!;
    const panel = panelRef.current!;
    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (anchor.contains(target) || panel.contains(target)) return;
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
