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
    expect(restoreAt([a, c], 1, b).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('restores to the front and to the end', () => {
    expect(restoreAt([b, c], 0, a).map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(restoreAt([a, b], 2, c).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('clamps an index the list has since outgrown', () => {
    // The page was refetched shorter while the delete was in flight.
    expect(restoreAt([a], 7, b).map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('clamps a negative index rather than splicing from the end', () => {
    // splice(-1) would insert *before the last* element, putting the entry
    // in the wrong place instead of the first.
    expect(restoreAt([a, b], -1, c).map((i) => i.id)).toEqual(['c', 'a', 'b']);
  });

  it('does nothing when the entry is already back', () => {
    const list = [a, b];
    expect(restoreAt(list, 0, b)).toBe(list);
  });

  it('restores into an empty list', () => {
    expect(restoreAt([], 3, a).map((i) => i.id)).toEqual(['a']);
  });

  it('leaves the original list untouched', () => {
    const list = [a, c];
    restoreAt(list, 1, b);
    expect(list.map((i) => i.id)).toEqual(['a', 'c']);
  });
});
