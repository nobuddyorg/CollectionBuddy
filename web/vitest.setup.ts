import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// `test.globals` is off, so Testing Library's own auto-cleanup (which
// registers via a global `afterEach`) never fires; without this, DOM nodes
// from one test in a file leak into the next.
afterEach(cleanup);

// jsdom has no CSSOM view module, so `window.matchMedia` isn't there -- any
// component asking the OS a question (useTheme, dark mode) throws on mount.
// Stubbed to answer "no" with no listeners; a test that cares should say so
// itself.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Node 22+ ships its own global `localStorage`, which Vitest's jsdom
// environment treats as already present and never overrides -- leaving
// `window.localStorage` silently undefined. Repoint the globals at jsdom's.
const dom = (globalThis as unknown as { jsdom?: { window: Window } }).jsdom;
if (dom) {
  Object.defineProperty(globalThis, 'localStorage', {
    get: () => dom.window.localStorage,
    configurable: true,
  });
  Object.defineProperty(globalThis, 'sessionStorage', {
    get: () => dom.window.sessionStorage,
    configurable: true,
  });
}
