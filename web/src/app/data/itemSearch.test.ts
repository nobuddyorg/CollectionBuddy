import { describe, expect, it } from 'vitest';

import {
  SEARCH_MIN_LENGTH,
  SEARCH_MIN_LENGTH_NON_ASCII,
  likePatternFor,
  searchMinLength,
} from './itemSearch';

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

  // Two characters earns a pattern here, where the same length declines for plain ASCII above.
  it('filters a two-character non-ASCII term', () => {
    expect(likePatternFor('日本')).toBe('%日本%');
  });

  it('still declines a one-character non-ASCII term', () => {
    expect(likePatternFor('日')).toBeNull();
  });

  it('escapes % and _ so they are not treated as wildcards', () => {
    expect(likePatternFor('50%')).toBe('%50\\%%');
    expect(likePatternFor('a_b')).toBe('%a\\_b%');
  });

  it('escapes a literal backslash for the LIKE layer', () => {
    expect(likePatternFor('a\\b')).toBe('%a\\\\b%');
  });
});

describe('searchMinLength', () => {
  it('is the ASCII minimum for a plain Latin term', () => {
    expect(searchMinLength('ab')).toBe(SEARCH_MIN_LENGTH);
  });

  it('is lower for a term carrying any non-ASCII character', () => {
    expect(searchMinLength('日本')).toBe(SEARCH_MIN_LENGTH_NON_ASCII);
  });

  it('drops to the non-ASCII floor even for a single non-ASCII character mixed with ASCII', () => {
    expect(searchMinLength('a€')).toBe(SEARCH_MIN_LENGTH_NON_ASCII);
  });
});
