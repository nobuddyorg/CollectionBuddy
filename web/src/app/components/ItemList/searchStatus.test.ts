import { describe, expect, it } from 'vitest';

import { searchStatusFor } from './searchStatus';

describe('searchStatusFor', () => {
  it('is inactive when nothing is typed', () => {
    expect(searchStatusFor('', 40)).toEqual({ kind: 'inactive' });
  });

  // Below the minimum, listItems applies no filter, so `total` is the whole category, not a match count.
  it('is tooShort below the minimum length, regardless of total', () => {
    expect(searchStatusFor('ab', 40)).toEqual({ kind: 'tooShort' });
  });

  it('is active at the minimum length, carrying the given total', () => {
    expect(searchStatusFor('abc', 5)).toEqual({ kind: 'active', total: 5 });
  });

  it('holds a non-ASCII term to the same minimum', () => {
    expect(searchStatusFor('Öl', 40)).toEqual({ kind: 'tooShort' });
    expect(searchStatusFor('Öle', 3)).toEqual({ kind: 'active', total: 3 });
  });
});
