// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SELECTED_CATEGORY_KEY,
  nextAfterRemoving,
  pickInitialCategory,
  readStoredCategory,
  sortCategories,
  storeSelectedCategory,
} from './selection';

const makeCategory = (id: string, name: string) => ({
  id,
  name,
  user_id: 'owner-1',
});

describe('sortCategories', () => {
  it('orders by name, ignoring case and accents', () => {
    const sorted = sortCategories([
      makeCategory('c', 'stamps'),
      makeCategory('a', 'Äpfel'),
      makeCategory('b', 'Coins'),
    ]);
    expect(sorted.map((category) => category.id)).toEqual(['a', 'b', 'c']);
  });

  // Names differing only in case compare equal, so the list keeps its arrival order.
  it('does not let case decide between two otherwise identical names', () => {
    const sorted = sortCategories([
      makeCategory('a', 'Apfel'),
      makeCategory('b', 'apfel'),
    ]);
    expect(sorted.map((category) => category.id)).toEqual(['a', 'b']);
  });

  it('leaves the given list alone', () => {
    const categories = [
      makeCategory('b', 'Stamps'),
      makeCategory('a', 'Coins'),
    ];
    sortCategories(categories);
    expect(categories.map((category) => category.id)).toEqual(['b', 'a']);
  });
});

// Spelled out: a changed key between releases loses every visitor's remembered selection.
describe('SELECTED_CATEGORY_KEY', () => {
  it('is the namespaced key visits are remembered under', () => {
    expect(SELECTED_CATEGORY_KEY).toBe('collectionbuddy.selectedCategory');
  });
});

describe('pickInitialCategory', () => {
  it('has nothing to open when the collection has no categories', () => {
    expect(pickInitialCategory([], 'a')).toBeNull();
  });

  it('opens the first category when there is no remembered one', () => {
    const categories = [
      makeCategory('b', 'Stamps'),
      makeCategory('a', 'Coins'),
      makeCategory('c', 'Teddies'),
    ];
    expect(pickInitialCategory(categories, null)).toBe('a');
  });

  it('opens the remembered category however many there are', () => {
    const categories = [
      makeCategory('a', 'Coins'),
      makeCategory('b', 'Stamps'),
    ];
    expect(pickInitialCategory(categories, 'b')).toBe('b');
  });

  it('falls back to the first when the remembered one is gone', () => {
    const categories = [
      makeCategory('b', 'Stamps'),
      makeCategory('a', 'Coins'),
    ];
    expect(pickInitialCategory(categories, 'deleted')).toBe('a');
  });

  it('opens a lone category whether or not it was the remembered one', () => {
    expect(pickInitialCategory([makeCategory('a', 'Coins')], null)).toBe('a');
    expect(pickInitialCategory([makeCategory('a', 'Coins')], 'a')).toBe('a');
  });
});

describe('nextAfterRemoving', () => {
  it('falls to the next in sorted order', () => {
    const categories = [
      makeCategory('a', 'Coins'),
      makeCategory('b', 'Stamps'),
      makeCategory('c', 'Teddies'),
    ];
    expect(nextAfterRemoving(categories, 'a')).toBe('b');
  });

  it('has nothing left once the last category is removed', () => {
    expect(nextAfterRemoving([makeCategory('a', 'Coins')], 'a')).toBeNull();
  });

  it('leaves the choice alone when the removed id is not among them', () => {
    const categories = [
      makeCategory('a', 'Coins'),
      makeCategory('b', 'Stamps'),
    ];
    expect(nextAfterRemoving(categories, 'gone')).toBe('a');
  });
});

describe('remembering the selection', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('keeps the last selection and reads it back', () => {
    storeSelectedCategory('a');
    expect(window.localStorage.getItem(SELECTED_CATEGORY_KEY)).toBe('a');
    expect(readStoredCategory()).toBe('a');
  });

  it('forgets it when the selection is cleared', () => {
    storeSelectedCategory('a');
    storeSelectedCategory(null);
    expect(readStoredCategory()).toBeNull();
  });

  it('has nothing to report before anything is chosen', () => {
    expect(readStoredCategory()).toBeNull();
  });

  it('survives storage that refuses to answer', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });

    expect(() => storeSelectedCategory('a')).not.toThrow();
    expect(() => storeSelectedCategory(null)).not.toThrow();
    expect(readStoredCategory()).toBeNull();
  });
});
