import { describe, expect, it } from 'vitest';

import { listViewFor } from './listView';

describe('listViewFor', () => {
  it.each([
    // [itemCount, total, loading, loadFailed, view]
    [3, 3, false, false, 'grid'],
    [3, 3, true, false, 'grid'],
    [3, 3, false, true, 'grid'],
    [0, 0, true, false, 'skeleton'],
    [0, 9, false, false, 'skeleton'],
    [0, 0, false, true, 'loadError'],
    [0, 0, true, true, 'loadError'],
    [0, 9, false, true, 'loadError'],
    [0, 0, false, false, 'empty'],
  ] as const)(
    '%i items of %i, loading %s, failed %s: %s',
    (itemCount, total, loading, loadFailed, view) => {
      expect(listViewFor({ itemCount, total, loading, loadFailed })).toBe(view);
    },
  );
});
