'use client';

import { useEffect } from 'react';

export function useEscapeToClose(enabled: boolean, onClose: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      // A nested widget (the place autocomplete's suggestion menu) may
      // already have handled its own Escape and called preventDefault() to
      // say so -- that keystroke is not meant to close the modal around it.
      if (e.key === 'Escape' && !e.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, onClose]);
}
