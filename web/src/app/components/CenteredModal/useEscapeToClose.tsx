'use client';

import { useEffect } from 'react';

export function useEscapeToClose(enabled: boolean, onClose: () => void) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, onClose]);
}
