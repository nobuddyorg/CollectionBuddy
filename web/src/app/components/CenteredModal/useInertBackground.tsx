'use client';

import { useEffect } from 'react';

// Keyed by element rather than a single counter: in real use there is only
// ever one #app-root, but keying by identity means independent renders (as
// in tests, where each one mounts its own root) never share a count.
const openCounts = new WeakMap<HTMLElement, number>();

// `aria-modal` on the dialog isn't honoured by every reader/browser pairing:
// VoiceOver and NVDA's virtual cursor (browse mode) can walk straight past
// it into the rest of the page. `inert` on the app root removes that
// background from both the accessibility tree and the tab order.
//
// Counted rather than a plain on/off, so a confirm dialog opening on top of
// an already-open modal keeps the root hidden until the last of them closes.
export function useInertBackground(active: boolean) {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;

    const root = document.getElementById('app-root');
    if (!root) return;

    const count = (openCounts.get(root) ?? 0) + 1;
    openCounts.set(root, count);
    if (count === 1) root.inert = true;

    return () => {
      const next = (openCounts.get(root) ?? 1) - 1;
      openCounts.set(root, next);
      if (next <= 0) root.inert = false;
    };
  }, [active]);
}
