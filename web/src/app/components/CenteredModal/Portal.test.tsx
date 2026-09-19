// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { Portal } from './Portal';

describe('Portal', () => {
  it('renders nothing when there is no document to portal into', () => {
    const original = globalThis.document;
    // @ts-expect-error -- simulating a server render, where `document`
    // doesn't exist at all.
    delete globalThis.document;
    try {
      expect(Portal({ children: 'content' })).toBeNull();
    } finally {
      globalThis.document = original;
    }
  });
});
