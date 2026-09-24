import { cleanup } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// With `test.globals` off, Testing Library's auto-cleanup never registers, so DOM nodes would leak between tests.
afterEach(cleanup);

// jsdom has no `window.matchMedia`; stubbed to answer "no" with no listeners, a test that cares overrides it.
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

// Node 22+ ships a global `localStorage` that Vitest's jsdom never overrides, leaving window's undefined.
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

// One fixed seed so a failure reproduces as-is; FC_SEED replays or explores another.
fc.configureGlobal({
  seed: Number(process.env.FC_SEED ?? 20260911),
  numRuns: 200,
});
