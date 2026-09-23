'use client';

import { useEffect } from 'react';

// Keyed by element so independent roots (each test mounts its own) never share a count.
const openCounts = new WeakMap<HTMLElement, number>();

// aria-modal alone is not honoured by VoiceOver or NVDA browse mode; inert on the root is.
export function useInertBackground(active: boolean) {
  useEffect(() => {
    if (!active) return;

    const root = document.getElementById('app-root');
    if (!root) return;

    // Counted, not on/off: a confirm over an open modal keeps the root inert until both close.
    const count = (openCounts.get(root) ?? 0) + 1;
    openCounts.set(root, count);
    if (count === 1) root.inert = true;

    return () => {
      const next = openCounts.get(root)! - 1;
      openCounts.set(root, next);
      if (next <= 0) root.inert = false;
    };
  }, [active]);
}
