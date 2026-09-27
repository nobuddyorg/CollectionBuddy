'use client';

import { useEffect } from 'react';

import { useSyncedRef } from '../../lib/useSyncedRef';

type KeydownHandler = (event: KeyboardEvent) => void;

// Open dialogs, oldest first: only the newest hears the keyboard, so Escape on a confirm spares the viewer beneath.
const layers = new Set<{ readonly current: KeydownHandler }>();

export function useTopmostKeydown(open: boolean, onKeyDown: KeydownHandler) {
  // A ref, so a new handler on re-render keeps the layer's place instead of moving it to the top.
  const onKeyDownRef = useSyncedRef(onKeyDown);

  useEffect(() => {
    if (!open) return;
    layers.add(onKeyDownRef);
    const onKey = (event: KeyboardEvent) => {
      // A nested widget (the place autocomplete) that preventDefault()s its key keeps it.
      if (event.defaultPrevented || [...layers].at(-1) !== onKeyDownRef) return;
      onKeyDownRef.current(event);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      layers.delete(onKeyDownRef);
    };
  }, [open, onKeyDownRef]);
}
