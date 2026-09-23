import { describe, expect, it } from 'vitest';

import { restoreAt } from './optimistic';

function entry(id: string): { id: string } {
  return { id };
}

const a = entry('a');
const b = entry('b');
const c = entry('c');

describe('restoreAt', () => {
  it('puts the entry back among the neighbours it had', () => {
    expect(
      restoreAt({ list: [a, c], index: 1, item: b }).map((i) => i.id),
    ).toEqual(['a', 'b', 'c']);
  });

  it('restores to the front and to the end', () => {
    expect(
      restoreAt({ list: [b, c], index: 0, item: a }).map((i) => i.id),
    ).toEqual(['a', 'b', 'c']);
    expect(
      restoreAt({ list: [a, b], index: 2, item: c }).map((i) => i.id),
    ).toEqual(['a', 'b', 'c']);
  });

  it('clamps an index the list has since outgrown', () => {
    // The page was refetched shorter while the delete was in flight.
    expect(
      restoreAt({ list: [a], index: 7, item: b }).map((i) => i.id),
    ).toEqual(['a', 'b']);
  });

  it('clamps a negative index rather than splicing from the end', () => {
    // splice(-1) would insert before the last element, not at the front.
    expect(
      restoreAt({ list: [a, b], index: -1, item: c }).map((i) => i.id),
    ).toEqual(['c', 'a', 'b']);
  });

  it('does nothing when the entry is already back', () => {
    const list = [a, b];
    expect(restoreAt({ list, index: 0, item: b })).toBe(list);
  });

  it('restores into an empty list', () => {
    expect(restoreAt({ list: [], index: 3, item: a }).map((i) => i.id)).toEqual(
      ['a'],
    );
  });

  it('leaves the original list untouched', () => {
    const list = [a, c];
    restoreAt({ list, index: 1, item: b });
    expect(list.map((i) => i.id)).toEqual(['a', 'c']);
  });
});
