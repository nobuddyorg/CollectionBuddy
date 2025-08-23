'use client';

import { useEffect } from 'react';

export function useLockBodyScroll(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    const { body } = document;
    const prev = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = prev;
    };
  }, [active]);
}
