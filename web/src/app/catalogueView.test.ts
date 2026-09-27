import { describe, expect, it } from 'vitest';

import { catalogueViewFor } from './catalogueView';

describe('catalogueViewFor', () => {
  it.each([
    // [ready, hasCategory, loadFailed, view]
    [false, false, false, 'skeleton'],
    [false, false, true, 'skeleton'],
    [false, true, false, 'skeleton'],
    [true, true, false, 'entries'],
    [true, true, true, 'entries'],
    [true, false, true, 'loadError'],
    [true, false, false, 'empty'],
  ] as const)(
    'ready %s, a category %s, failed %s: %s',
    (ready, hasCategory, loadFailed, view) => {
      expect(catalogueViewFor({ ready, hasCategory, loadFailed })).toBe(view);
    },
  );
});
