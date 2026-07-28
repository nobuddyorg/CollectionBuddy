import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// `test.globals` is off, so Testing Library's own auto-cleanup (which
// registers via a global `afterEach`) never fires; without this, DOM nodes
// from one test in a file leak into the next.
afterEach(cleanup);

// Node 22+ ships its own global `localStorage`/`sessionStorage` (behind
// --localstorage-file), which Vitest's jsdom environment treats as "already
// present" and therefore never overrides with jsdom's real implementation --
// leaving `window.localStorage` silently undefined in every jsdom test.
// Repoint the globals at the jsdom instance the environment already created.
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
