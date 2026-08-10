import { describe, expect, it, vi } from 'vitest';

import { supabase } from '../supabase';
import {
  countItemsForCategory,
  createCategory,
  deleteCategory,
  listCategories,
  listItemIdsForCategory,
  listItemIdsLinkedElsewhere,
  renameCategory,
} from './categories';

// #341: these build the query that decides which items a category deletion
// would orphan -- set arithmetic with a real data-loss consequence if
// `.neq()` were flipped to `.eq()`, or the `.in()` list built from the wrong
// array. 0% covered, so nothing would have caught either. Each function here
// only builds a query and hands it back for the caller to await, so what's
// worth asserting is which table, columns and filters it built -- not a
// resolved value, which would just be echoing the mock back at itself.

type Call = { method: string; args: unknown[] };

/**
 * A chainable stand-in for postgrest-js's query builder: every method
 * records itself and returns the same object, so a call like
 * `.select('item_id').in(...).neq(...)` can be read back afterwards as an
 * ordered list of (method, args) pairs -- the actual shape of the query,
 * not just that some method was called with some argument somewhere.
 */
function mockQueryBuilder() {
  const calls: Call[] = [];
  const methods = [
    'select',
    'insert',
    'update',
    'delete',
    'eq',
    'neq',
    'in',
    'single',
    'returns',
  ] as const;
  const builder: Record<string, (...args: unknown[]) => unknown> = {};
  for (const method of methods) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  return { builder, calls };
}

function mockFrom() {
  const { builder, calls } = mockQueryBuilder();
  const from = vi.fn().mockReturnValue(builder);
  vi.spyOn(supabase, 'from').mockImplementation(from);
  return { from, calls };
}

describe('listCategories', () => {
  it('selects id and name from categories', () => {
    const { from, calls } = mockFrom();
    listCategories();
    expect(from).toHaveBeenCalledWith('categories');
    expect(calls[0]).toEqual({ method: 'select', args: ['id,name'] });
  });
});

describe('createCategory', () => {
  it('inserts only the name, leaving user_id to the enforce_user_id trigger', () => {
    const { from, calls } = mockFrom();
    createCategory('Coins');
    expect(from).toHaveBeenCalledWith('categories');
    expect(calls[0]).toEqual({ method: 'insert', args: [{ name: 'Coins' }] });
    expect(calls[1]).toEqual({ method: 'select', args: ['id,name'] });
    expect(calls[2].method).toBe('single');
  });
});

describe('renameCategory', () => {
  it('updates the name of exactly the given category', () => {
    const { from, calls } = mockFrom();
    renameCategory('cat-1', 'Stamps');
    expect(from).toHaveBeenCalledWith('categories');
    expect(calls[0]).toEqual({ method: 'update', args: [{ name: 'Stamps' }] });
    expect(calls[1]).toEqual({ method: 'eq', args: ['id', 'cat-1'] });
  });
});

describe('deleteCategory', () => {
  it('deletes exactly the given category', () => {
    const { from, calls } = mockFrom();
    deleteCategory('cat-1');
    expect(from).toHaveBeenCalledWith('categories');
    expect(calls[0].method).toBe('delete');
    expect(calls[1]).toEqual({ method: 'eq', args: ['id', 'cat-1'] });
  });
});

describe('listItemIdsForCategory', () => {
  it('selects item ids for exactly the given category', () => {
    const { from, calls } = mockFrom();
    listItemIdsForCategory('cat-1');
    expect(from).toHaveBeenCalledWith('item_categories');
    expect(calls[0]).toEqual({ method: 'select', args: ['item_id'] });
    expect(calls[1]).toEqual({
      method: 'eq',
      args: ['category_id', 'cat-1'],
    });
  });
});

describe('countItemsForCategory', () => {
  it('asks for an exact count with no rows, for the given category', () => {
    const { from, calls } = mockFrom();
    countItemsForCategory('cat-1');
    expect(from).toHaveBeenCalledWith('item_categories');
    expect(calls[0]).toEqual({
      method: 'select',
      args: ['item_id', { count: 'exact', head: true }],
    });
    expect(calls[1]).toEqual({
      method: 'eq',
      args: ['category_id', 'cat-1'],
    });
  });
});

// The one query in this file a flipped operator silently corrupts: `.in()`
// has to carry exactly the candidate ids, and `.neq()` -- not `.eq()` -- is
// what makes the result "still linked elsewhere" rather than "linked to the
// category being deleted". Getting either wrong doesn't error; it just
// orphans or preserves the wrong items.
describe('listItemIdsLinkedElsewhere', () => {
  it('filters to the given item ids, excluding the category being deleted', () => {
    const { from, calls } = mockFrom();
    listItemIdsLinkedElsewhere(['item-1', 'item-2'], 'cat-1');
    expect(from).toHaveBeenCalledWith('item_categories');
    expect(calls[0]).toEqual({ method: 'select', args: ['item_id'] });
    expect(calls[1]).toEqual({
      method: 'in',
      args: ['item_id', ['item-1', 'item-2']],
    });
    expect(calls[2]).toEqual({
      method: 'neq',
      args: ['category_id', 'cat-1'],
    });
  });

  it('carries the exact candidate list through to .in(), not a copy that could drift', () => {
    const { calls } = mockFrom();
    const ids = ['a', 'b', 'c'];
    listItemIdsLinkedElsewhere(ids, 'cat-1');
    const inCall = calls.find((c) => c.method === 'in')!;
    expect(inCall.args[1]).toBe(ids);
  });
});
