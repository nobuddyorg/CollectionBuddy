'use client';

import { useEffect } from 'react';

export function useEscapeToClose(enabled: boolean, onClose: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      // A nested widget (the place autocomplete) that preventDefault()s its Escape keeps the modal.
      if (event.key === 'Escape' && !event.defaultPrevented) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, onClose]);
}
