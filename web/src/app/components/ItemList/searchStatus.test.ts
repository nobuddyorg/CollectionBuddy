import { describe, expect, it } from 'vitest';

import { searchStatusFor } from './searchStatus';

describe('searchStatusFor', () => {
  it('is inactive when nothing is typed', () => {
    expect(searchStatusFor('', 40)).toEqual({ kind: 'inactive' });
  });

  // Below the minimum, listItems applies no filter at all -- `total` here is
  // the whole category's count, not a match count, so it must not surface as
  // one (#307).
  it('is tooShort below the minimum length, regardless of total', () => {
    expect(searchStatusFor('ab', 40)).toEqual({ kind: 'tooShort' });
  });

  it('is active at the minimum length, carrying the given total', () => {
    expect(searchStatusFor('abc', 5)).toEqual({ kind: 'active', total: 5 });
  });

  it('uses the lower non-ASCII floor', () => {
    expect(searchStatusFor('日本', 3)).toEqual({ kind: 'active', total: 3 });
    expect(searchStatusFor('日', 40)).toEqual({ kind: 'tooShort' });
  });
});
