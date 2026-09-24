import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { buildSearchFilter } from './itemSearch';

// Characters that mean something to PostgREST's or=() grammar or to LIKE.
const HOSTILE = fc.constantFrom('"', '\\', ',', '(', ')', '.', ':', '%', '_');
const anyTerm = fc.oneof(
  fc.string({ unit: 'binary' }),
  fc.string({ unit: fc.oneof(HOSTILE, fc.constantFrom('a', 'ä', ' ')) }),
);

/** Splits an or=() body the way PostgREST does: commas outside quotes. */
function conditions(filter: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < filter.length; i++) {
    const char = filter[i];
    if (quoted && char === '\\') {
      current += char + filter[++i];
    } else if (char === '"') {
      quoted = !quoted;
      current += char;
    } else if (char === ',' && !quoted) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  expect(quoted).toBe(false);
  parts.push(current);
  return parts;
}

/** The value inside `column.ilike."..."`, with PostgREST's escapes undone. */
function unquote(condition: string): { column: string; value: string } {
  const match = /^(\w+)\.ilike\."([\s\S]*)"$/.exec(condition);
  expect(match).not.toBeNull();
  return {
    column: match![1],
    value: match![2].replace(/\\([\s\S])/g, '$1'),
  };
}

/** A LIKE pattern back to the substring it matches literally. */
function unlike(pattern: string): string {
  expect(pattern.startsWith('%') && pattern.endsWith('%')).toBe(true);
  return pattern.slice(1, -1).replace(/\\([\s\S])/g, '$1');
}

describe('buildSearchFilter, for any search term', () => {
  it('is exactly four ILIKE conditions, one per searchable column', () => {
    fc.assert(
      fc.property(anyTerm, (term) => {
        expect(
          conditions(buildSearchFilter(term)).map(
            (condition) => unquote(condition).column,
          ),
        ).toEqual(['title', 'description', 'place', 'tags_text']);
      }),
    );
  });

  it('matches the term itself, literally, in every column', () => {
    fc.assert(
      fc.property(anyTerm, (term) => {
        for (const condition of conditions(buildSearchFilter(term))) {
          expect(unlike(unquote(condition).value)).toBe(term);
        }
      }),
    );
  });
});
