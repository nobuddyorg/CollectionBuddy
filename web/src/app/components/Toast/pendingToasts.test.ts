import { describe, expect, it } from 'vitest';

import { createPendingToasts } from './pendingToasts';

describe('createPendingToasts', () => {
  it('hands out an added entry once, then forgets it', () => {
    const pending = createPendingToasts<string>();
    pending.add(1, 'delete entry');

    expect(pending.take(1)).toBe('delete entry');
    expect(pending.take(1)).toBeUndefined();
    expect(pending.ids()).toEqual([]);
  });

  it('takes nothing for an id it never held', () => {
    const pending = createPendingToasts<string>();
    pending.add(1, 'delete entry');

    expect(pending.take(2)).toBeUndefined();
    expect(pending.ids()).toEqual([1]);
  });

  it('lists only the entries not yet taken, in the order they were added', () => {
    const pending = createPendingToasts<string>();
    pending.add(1, 'delete entry');
    pending.add(2, 'delete photo');
    pending.add(3, 'delete category');

    pending.take(2);

    expect(pending.ids()).toEqual([1, 3]);
  });

  it('keeps separate instances apart', () => {
    const first = createPendingToasts<string>();
    const second = createPendingToasts<string>();
    first.add(1, 'delete entry');

    expect(second.take(1)).toBeUndefined();
    expect(first.take(1)).toBe('delete entry');
  });
});
