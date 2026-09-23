import { describe, expect, it } from 'vitest';

import { chunk } from './chunk';

describe('chunk', () => {
  it('splits a list into runs of the given size, in order', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('keeps every item exactly once, in its original order', () => {
    const items = Array.from({ length: 250 }, (_, i) => i);

    expect(chunk(items, 100).flat()).toEqual(items);
  });

  // An exact multiple must not end with a trailing empty run, which would be one request for no rows.
  it('produces no trailing empty run for an exact multiple', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('gives the remainder its own shorter run', () => {
    expect(chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });

  it('has nothing to do with an empty list', () => {
    expect(chunk([], 100)).toEqual([]);
  });

  it('puts a list shorter than one run into a single run', () => {
    expect(chunk([1, 2], 100)).toEqual([[1, 2]]);
  });

  it('splits into single-item runs at size one', () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });
});
