import { describe, expect, it } from 'vitest';

import { buildSearchFilter } from './items';

// Pulls the quoted value back out of `title.ilike."<value>"` and undoes
// PostgREST's own quoted-string escaping, i.e. simulates what the server
// sees after parsing the or=() filter string -- not what SQL sees after
// LIKE pattern matching (that layer still has its own \% / \_ escapes).
function unwrapQuotedValue(filter: string): string {
  const match = filter.match(/title\.ilike\."(.*?)",description\.ilike\./);
  if (!match) throw new Error(`Could not find quoted value in: ${filter}`);
  return match[1].replace(/\\(.)/g, '$1');
}

describe('buildSearchFilter', () => {
  it('produces one ilike clause per searchable column, all quoted the same way', () => {
    const filter = buildSearchFilter('coin');
    expect(filter).toBe(
      'title.ilike."%coin%",description.ilike."%coin%",place.ilike."%coin%",tags_text.ilike."%coin%"',
    );
  });

  it('escapes % so it is not treated as a wildcard', () => {
    const filter = buildSearchFilter('50%');
    expect(unwrapQuotedValue(filter)).toBe('%50\\%%');
  });

  it('escapes _ so it is not treated as a single-char wildcard', () => {
    const filter = buildSearchFilter('a_b');
    expect(unwrapQuotedValue(filter)).toBe('%a\\_b%');
  });

  it('does not corrupt the or=() grouping when the term contains a comma', () => {
    const filter = buildSearchFilter('a,b');
    expect(filter).toContain('"%a,b%"');
    // Exactly 4 top-level clauses -- a stray unquoted comma would produce more.
    expect(filter.split('.ilike.')).toHaveLength(5);
  });

  it('does not close the or=() group early when the term contains a paren', () => {
    const filter = buildSearchFilter('(test)');
    expect(filter).toContain('"%(test)%"');
  });

  it('escapes an embedded double quote', () => {
    const filter = buildSearchFilter('say "hi"');
    expect(filter).toContain('\\"hi\\"');
  });

  it('escapes a literal backslash for both the LIKE and quoting layers', () => {
    const filter = buildSearchFilter('a\\b');
    // After undoing PostgREST's own quoted-string escaping, what's left
    // must be the SQL-level LIKE escape sequence for one literal
    // backslash: escape-char (\) + literal backslash = "\\".
    expect(unwrapQuotedValue(filter)).toBe('%a\\\\b%');
  });
});
