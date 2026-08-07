'use client';

import { useEffect } from 'react';

// Keyed by element rather than a single counter: in real use there is only
// ever one #app-root, but keying by identity means independent renders (as
// in tests, where each one mounts its own root) never share a count.
const openCounts = new WeakMap<HTMLElement, number>();

// Hides the app root -- header, main and footer, everything but the dialog
// layer itself -- from assistive tech while a dialog is open. `aria-modal`
// on the dialog is not honoured by every reader/browser pairing on its own:
// VoiceOver and NVDA's virtual cursor (browse mode) walks straight past it
// into the header, the category tabs and the entry grid behind the dialog
// (#295). `inert` removes that background from both the accessibility tree
// and the tab order -- the same primitive Dialog.tsx already relied on
// (just on itself, which never actually rendered closed -- see the dead
// code this replaces), now pointed at the element that needed it.
//
// Shared by every dialog rather than folded into one, so a confirm dialog
// opening on top of an already-open edit modal keeps the root hidden until
// the last of them closes -- not just the first one to close, which is why
// this counts rather than tracking a plain on/off.
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
