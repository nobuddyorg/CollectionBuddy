// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  SELECTED_CATEGORY_KEY,
  pickInitialCategory,
  readStoredCategory,
  sortCategories,
  storeSelectedCategory,
} from './selection';

const cat = (id: string, name: string) => ({ id, name, user_id: 'owner-1' });

describe('sortCategories', () => {
  it('orders by name, ignoring case and accents', () => {
    const sorted = sortCategories([
      cat('c', 'stamps'),
      cat('a', 'Äpfel'),
      cat('b', 'Coins'),
    ]);
    expect(sorted.map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('leaves the given list alone', () => {
    const cats = [cat('b', 'Stamps'), cat('a', 'Coins')];
    sortCategories(cats);
    expect(cats.map((c) => c.id)).toEqual(['b', 'a']);
  });
});

describe('pickInitialCategory', () => {
  it('has nothing to open when the collection has no categories', () => {
    expect(pickInitialCategory([], 'a')).toBeNull();
  });

  // The whole point: signing in used to land on "choose a category" unless
  // the collection happened to have exactly one.
  it('opens the first category when there is no remembered one', () => {
    const cats = [cat('b', 'Stamps'), cat('a', 'Coins'), cat('c', 'Teddies')];
    expect(pickInitialCategory(cats, null)).toBe('a');
  });

  it('opens the remembered category however many there are', () => {
    const cats = [cat('a', 'Coins'), cat('b', 'Stamps')];
    expect(pickInitialCategory(cats, 'b')).toBe('b');
  });

  it('falls back to the first when the remembered one is gone', () => {
    const cats = [cat('b', 'Stamps'), cat('a', 'Coins')];
    expect(pickInitialCategory(cats, 'deleted')).toBe('a');
  });

  it('opens a lone category whether or not it was the remembered one', () => {
    expect(pickInitialCategory([cat('a', 'Coins')], null)).toBe('a');
    expect(pickInitialCategory([cat('a', 'Coins')], 'a')).toBe('a');
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

  // Safari's private mode throws on both of these. Losing the preference
  // is a smaller failure than failing to render the catalogue.
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
