import { describe, expect, it } from 'vitest';

import { SEARCH_MIN_LENGTH, likePatternFor } from './itemSearch';

describe('likePatternFor', () => {
  it('produces the bare %...% pattern for a term long enough to use it', () => {
    expect(likePatternFor('coin')).toBe('%coin%');
  });

  it('filters at exactly the minimum length', () => {
    expect(likePatternFor('a'.repeat(SEARCH_MIN_LENGTH))).toBe('%aaa%');
  });

  it('declines a term one short of the minimum', () => {
    expect(likePatternFor('a'.repeat(SEARCH_MIN_LENGTH - 1))).toBeNull();
  });

  it('declines an empty term', () => {
    expect(likePatternFor('')).toBeNull();
  });

  // `%Öl%` holds no trigram either, so the index could not narrow it.
  it('declines a two-character non-ASCII term like any other', () => {
    expect(likePatternFor('Öl')).toBeNull();
    expect(likePatternFor('日本')).toBeNull();
  });

  it('filters a three-character non-ASCII term', () => {
    expect(likePatternFor('Öle')).toBe('%Öle%');
  });

  it('escapes % and _ so they are not treated as wildcards', () => {
    expect(likePatternFor('50%')).toBe('%50\\%%');
    expect(likePatternFor('a_b')).toBe('%a\\_b%');
  });

  it('escapes a literal backslash for the LIKE layer', () => {
    expect(likePatternFor('a\\b')).toBe('%a\\\\b%');
  });
});
