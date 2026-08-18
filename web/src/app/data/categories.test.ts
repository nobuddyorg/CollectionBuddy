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
  uniqueCategoryName,
} from './categories';

// These tests assert the query shape (table, columns, filters), since each
// function just builds a query and hands it back; asserting a resolved
// value would just echo the mock.

type Call = { method: string; args: unknown[] };

/**
 * Chainable stand-in for postgrest-js's query builder: every method records
 * itself and returns the same object, so a call chain can be read back as an
 * ordered list of (method, args) pairs.
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
    'range',
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
  it("selects id, name, user_id and the caller's own share role from categories", () => {
    const { from, calls } = mockFrom();
    listCategories();
    expect(from).toHaveBeenCalledWith('categories');
    expect(calls[0]).toEqual({
      method: 'select',
      args: ['id,name,user_id,category_shares(role)'],
    });
  });
});

describe('createCategory', () => {
  it('inserts only the name, leaving user_id to the enforce_user_id trigger', () => {
    const { from, calls } = mockFrom();
    createCategory('Coins');
    expect(from).toHaveBeenCalledWith('categories');
    expect(calls[0]).toEqual({ method: 'insert', args: [{ name: 'Coins' }] });
    expect(calls[1]).toEqual({ method: 'select', args: ['id,name,user_id'] });
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
  it('selects item ids for exactly the given category, ranged for the first page', async () => {
    const { from, calls } = mockFrom();
    await listItemIdsForCategory('cat-1');
    expect(from).toHaveBeenCalledWith('item_categories');
    expect(calls[0]).toEqual({ method: 'select', args: ['item_id'] });
    expect(calls[1]).toEqual({
      method: 'eq',
      args: ['category_id', 'cat-1'],
    });
    expect(calls[2]).toEqual({ method: 'range', args: [0, 999] });
  });

  // Regression: an unpaginated read here undercounted a category above
  // PostgREST's row cap, silently orphaning ids past the cutoff.
  it('pages past a full page and concatenates the ids', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({
      item_id: `id-${i}`,
    }));
    const shortPage = [{ item_id: 'id-last' }];
    const listPage = vi
      .fn()
      .mockResolvedValueOnce({ data: fullPage, error: null })
      .mockResolvedValueOnce({ data: shortPage, error: null });

    const { data, error } = await listItemIdsForCategory('cat-1', listPage);

    expect(error).toBeNull();
    expect(data).toHaveLength(1001);
    expect(data![0]).toBe('id-0');
    expect(data![1000]).toBe('id-last');
    expect(listPage).toHaveBeenCalledTimes(2);
    expect(listPage).toHaveBeenNthCalledWith(1, 'cat-1', 0, 999);
    expect(listPage).toHaveBeenNthCalledWith(2, 'cat-1', 1000, 1999);
  });

  it('stops on the first page that errors, returning no partial data', async () => {
    const listPage = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('boom') });

    const { data, error } = await listItemIdsForCategory('cat-1', listPage);

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
    expect(listPage).toHaveBeenCalledTimes(1);
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

// A flipped `.neq()`/`.eq()` here wouldn't error; it would silently orphan
// or preserve the wrong items.
describe('listItemIdsLinkedElsewhere', () => {
  it('filters to the given item ids, excluding the category being deleted', async () => {
    const { from, calls } = mockFrom();
    await listItemIdsLinkedElsewhere(['item-1', 'item-2'], 'cat-1');
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
    expect(calls[3]).toEqual({ method: 'range', args: [0, 999] });
  });

  it('carries the exact candidate values through to .in() when under the chunk size', async () => {
    const { calls } = mockFrom();
    const ids = ['a', 'b', 'c'];
    await listItemIdsLinkedElsewhere(ids, 'cat-1');
    const inCall = calls.find((c) => c.method === 'in')!;
    // A chunked slice, not the original array reference: even a list under
    // the chunk size passes through `.slice()`.
    expect(inCall.args[1]).toEqual(ids);
  });

  // `.in()` puts every id in the query string; thousands of UUIDs would hit
  // a URL length limit before the row cap does, hence chunking.
  it('chunks a candidate list over 100 ids into multiple .in() calls', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const page1 = [{ item_id: 'id-0' }];
    const page2 = [{ item_id: 'id-100' }];
    const page3 = [{ item_id: 'id-200' }];
    const listPage = vi
      .fn()
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null })
      .mockResolvedValueOnce({ data: page3, error: null });

    const { data, error } = await listItemIdsLinkedElsewhere(
      ids,
      'cat-1',
      listPage,
    );

    expect(error).toBeNull();
    expect(data).toEqual(['id-0', 'id-100', 'id-200']);
    expect(listPage).toHaveBeenCalledTimes(3);
    expect(listPage).toHaveBeenNthCalledWith(
      1,
      ids.slice(0, 100),
      'cat-1',
      0,
      999,
    );
    expect(listPage).toHaveBeenNthCalledWith(
      2,
      ids.slice(100, 200),
      'cat-1',
      0,
      999,
    );
    expect(listPage).toHaveBeenNthCalledWith(
      3,
      ids.slice(200, 250),
      'cat-1',
      0,
      999,
    );
  });

  it('pages within a single chunk past a full page and unions the results', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({
      item_id: `linked-${i}`,
    }));
    const shortPage = [{ item_id: 'linked-last' }];
    const listPage = vi
      .fn()
      .mockResolvedValueOnce({ data: fullPage, error: null })
      .mockResolvedValueOnce({ data: shortPage, error: null });

    const { data } = await listItemIdsLinkedElsewhere(
      ['item-1'],
      'cat-1',
      listPage,
    );

    expect(data).toHaveLength(1001);
    expect(listPage).toHaveBeenCalledTimes(2);
    expect(listPage).toHaveBeenNthCalledWith(1, ['item-1'], 'cat-1', 0, 999);
    expect(listPage).toHaveBeenNthCalledWith(
      2,
      ['item-1'],
      'cat-1',
      1000,
      1999,
    );
  });

  it('stops on the first page that errors, returning no partial data', async () => {
    const listPage = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('boom') });

    const { data, error } = await listItemIdsLinkedElsewhere(
      ['item-1'],
      'cat-1',
      listPage,
    );

    expect(data).toBeNull();
    expect(error).toBeInstanceOf(Error);
  });
});

describe('uniqueCategoryName', () => {
  it('returns the base name unchanged when nothing collides', () => {
    expect(uniqueCategoryName('Coins', ['Stamps'])).toBe('Coins');
  });

  it('appends (2) on the first collision', () => {
    expect(uniqueCategoryName('Coins', ['Coins'])).toBe('Coins (2)');
  });

  it('collides case-insensitively, matching the database constraint', () => {
    expect(uniqueCategoryName('Coins', ['coins'])).toBe('Coins (2)');
  });

  it('keeps counting past an existing (2) to the next free number', () => {
    expect(uniqueCategoryName('Coins', ['Coins', 'Coins (2)'])).toBe(
      'Coins (3)',
    );
  });

  it('does not get stuck by a gap -- (2) free but (3) taken', () => {
    expect(uniqueCategoryName('Coins', ['Coins', 'Coins (3)'])).toBe(
      'Coins (2)',
    );
  });
});
