import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { SEARCH_MIN_LENGTH, likePatternFor } from './itemSearch';

// Characters that mean something to LIKE, or to the string layers wrapped around it.
const HOSTILE = fc.constantFrom('"', "'", '\\', ',', '(', ')', '.', '%', '_');
const anyTerm = fc.oneof(
  fc.string({ unit: 'binary', minLength: SEARCH_MIN_LENGTH }),
  fc.string({
    unit: fc.oneof(HOSTILE, fc.constantFrom('a', 'ä', ' ')),
    minLength: SEARCH_MIN_LENGTH,
  }),
);

/** The text a `%...%` LIKE pattern matches, failing on any wildcard inside it. */
function literalOf(pattern: string): string {
  expect(pattern.startsWith('%') && pattern.endsWith('%')).toBe(true);
  const inner = pattern.slice(1, -1);
  let literal = '';
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    expect(char === '%' || char === '_').toBe(false);
    literal += char === '\\' ? inner[++i] : char;
  }
  return literal;
}

describe('likePatternFor, for any search term long enough to search', () => {
  it('matches the term itself, literally, as a substring', () => {
    fc.assert(
      fc.property(anyTerm, (term) => {
        expect(literalOf(likePatternFor(term)!)).toBe(term);
      }),
    );
  });
});
