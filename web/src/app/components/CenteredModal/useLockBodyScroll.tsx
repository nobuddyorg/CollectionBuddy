'use client';

import { useEffect } from 'react';

export function useLockBodyScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const { body } = document;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previous;
    };
  }, [active]);
}
