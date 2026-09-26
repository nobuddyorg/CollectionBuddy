import { describe, expect, it, vi } from 'vitest';

import { supabase } from '../supabase';
import {
  canEditCategory,
  countItemsForCategory,
  createCategory,
  deleteCategory,
  listCategories,
  listItemIdsForCategory,
  listItemIdsLinkedElsewhere,
  renameCategory,
  uniqueCategoryName,
} from './categories';

// Each function only builds a query, so the query's shape is what is asserted, not an echoed mock.

type Call = { method: string; args: unknown[] };

/** A chainable stand-in for the query builder that records every call in order. */
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
    'gte',
    'or',
    'order',
    'limit',
    'single',
    'overrideTypes',
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

/** Like mockFrom, but each awaited query answers with the next of `pages`, so a later page's query can be read. */
function mockFromPages(pages: unknown[][]) {
  const { builder, calls } = mockQueryBuilder();
  const answers = pages.values();
  builder.then = (resolve) =>
    (resolve as (value: unknown) => unknown)({
      data: answers.next().value ?? [],
      error: null,
    });
  const from = vi.fn().mockReturnValue(builder);
  vi.spyOn(supabase, 'from').mockImplementation(from);
  return { from, calls };
}

/** The calls of the query built after the first `select`, i.e. the second page's. */
function secondPageCalls(calls: Call[]): Call[] {
  const selects = calls.flatMap((call, index) =>
    call.method === 'select' ? [index] : [],
  );
  return calls.slice(selects[1]);
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
    expect(calls[2]).toEqual({ method: 'select', args: ['id,name,user_id'] });
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

const link = (i: number) => ({
  item_id: `id-${String(i).padStart(4, '0')}`,
  created_at: '2026-01-01T00:00:00+00:00',
});

describe('listItemIdsForCategory', () => {
  it("reads the first page oldest-first by link, from the category's links alone", async () => {
    const { from, calls } = mockFromPages([]);
    await listItemIdsForCategory('cat-1');
    expect(from).toHaveBeenCalledWith('item_categories');
    expect(calls).toEqual([
      { method: 'select', args: ['item_id,created_at'] },
      { method: 'eq', args: ['category_id', 'cat-1'] },
      { method: 'order', args: ['created_at'] },
      { method: 'order', args: ['item_id'] },
      { method: 'limit', args: [1000] },
    ]);
  });

  it('starts the next page strictly after the last link read, with no offset', async () => {
    const { calls } = mockFromPages([
      Array.from({ length: 1000 }, (_, i) => link(i)),
    ]);
    await listItemIdsForCategory('cat-1');
    const last = link(999);
    expect(secondPageCalls(calls)).toEqual([
      { method: 'select', args: ['item_id,created_at'] },
      { method: 'eq', args: ['category_id', 'cat-1'] },
      { method: 'gte', args: ['created_at', last.created_at] },
      {
        method: 'or',
        args: [
          `created_at.gt."${last.created_at}",and(created_at.eq."${last.created_at}",item_id.gt."${last.item_id}")`,
        ],
      },
      { method: 'order', args: ['created_at'] },
      { method: 'order', args: ['item_id'] },
      { method: 'limit', args: [1000] },
    ]);
  });

  // Regression (#766): offset pages shifted when a link went mid-walk, so an entry's photographs outlived its delete.
  it('misses no link when an entry leaves the category between pages', async () => {
    const table = Array.from({ length: 1001 }, (_, i) => link(i));
    const listPage = vi
      .fn()
      .mockImplementation(
        async ({ after }: { after: { item_id: string } | null }) => {
          const page = table
            .filter((row) => after === null || row.item_id > after.item_id)
            .slice(0, 1000);
          if (after === null) table.splice(0, 1);
          return { data: page, error: null };
        },
      );

    const { data } = await listItemIdsForCategory('cat-1', listPage);

    expect(data).toHaveLength(1001);
    expect(data!.at(-1)).toBe('id-1000');
  });

  it('pages past a full page, handing each read the last link, and joins the ids', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => link(i));
    const shortPage = [link(1000)];
    const listPage = vi
      .fn()
      .mockResolvedValueOnce({ data: fullPage, error: null })
      .mockResolvedValueOnce({ data: shortPage, error: null });

    const { data, error } = await listItemIdsForCategory('cat-1', listPage);

    expect(error).toBeNull();
    expect(data).toEqual([...fullPage, ...shortPage].map((row) => row.item_id));
    expect(listPage.mock.calls).toEqual([
      [{ categoryId: 'cat-1', after: null }],
      [{ categoryId: 'cat-1', after: link(999) }],
    ]);
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

// A flipped `.neq()`/`.eq()` would not error; it would silently orphan or preserve the wrong items.
describe('listItemIdsLinkedElsewhere', () => {
  it('filters to the given item ids, excluding the category being deleted', async () => {
    const { from, calls } = mockFrom();
    await listItemIdsLinkedElsewhere({
      itemIds: ['item-1', 'item-2'],
      excludingCategoryId: 'cat-1',
    });
    expect(from).toHaveBeenCalledWith('item_categories');
    expect(calls).toEqual([
      { method: 'select', args: ['item_id,category_id'] },
      { method: 'in', args: ['item_id', ['item-1', 'item-2']] },
      { method: 'neq', args: ['category_id', 'cat-1'] },
      { method: 'order', args: ['item_id'] },
      { method: 'order', args: ['category_id'] },
      { method: 'limit', args: [1000] },
    ]);
  });

  it('starts the next page strictly after the last link read, on the primary key', async () => {
    const last = { item_id: 'item-1', category_id: 'cat-9' };
    const { calls } = mockFromPages([
      Array.from({ length: 1000 }, () => ({ ...last })),
    ]);
    await listItemIdsLinkedElsewhere({
      itemIds: ['item-1'],
      excludingCategoryId: 'cat-1',
    });
    expect(secondPageCalls(calls)).toEqual([
      { method: 'select', args: ['item_id,category_id'] },
      { method: 'in', args: ['item_id', ['item-1']] },
      { method: 'neq', args: ['category_id', 'cat-1'] },
      { method: 'gte', args: ['item_id', 'item-1'] },
      {
        method: 'or',
        args: [
          'item_id.gt."item-1",and(item_id.eq."item-1",category_id.gt."cat-9")',
        ],
      },
      { method: 'order', args: ['item_id'] },
      { method: 'order', args: ['category_id'] },
      { method: 'limit', args: [1000] },
    ]);
  });

  it('carries the exact candidate values through to .in() when under the chunk size', async () => {
    const { calls } = mockFrom();
    const ids = ['a', 'b', 'c'];
    await listItemIdsLinkedElsewhere({
      itemIds: ids,
      excludingCategoryId: 'cat-1',
    });
    const inCall = calls.find((call) => call.method === 'in')!;
    // A chunked slice, not the original reference: even a short list passes through `.slice()`.
    expect(inCall.args[1]).toEqual(ids);
  });

  // `.in()` puts every id in the query string; thousands of UUIDs would hit a URL length limit.
  it('asks nothing more of a list that fills its last chunk exactly', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => `id-${i}`);
    const listPage = vi.fn().mockResolvedValue({ data: [], error: null });

    await listItemIdsLinkedElsewhere(
      { itemIds: ids, excludingCategoryId: 'cat-1' },
      listPage,
    );

    expect(listPage).toHaveBeenCalledTimes(2);
  });

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
      { itemIds: ids, excludingCategoryId: 'cat-1' },
      listPage,
    );

    expect(error).toBeNull();
    expect(data).toEqual(['id-0', 'id-100', 'id-200']);
    expect(listPage).toHaveBeenCalledTimes(3);
    expect(listPage).toHaveBeenNthCalledWith(1, {
      itemIds: ids.slice(0, 100),
      excludingCategoryId: 'cat-1',
      after: null,
    });
    expect(listPage).toHaveBeenNthCalledWith(2, {
      itemIds: ids.slice(100, 200),
      excludingCategoryId: 'cat-1',
      after: null,
    });
    expect(listPage).toHaveBeenNthCalledWith(3, {
      itemIds: ids.slice(200, 250),
      excludingCategoryId: 'cat-1',
      after: null,
    });
  });

  it('pages within a single chunk past a full page, after its last link, and unions the results', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({
      item_id: `linked-${i}`,
      category_id: 'cat-2',
    }));
    const shortPage = [{ item_id: 'linked-last', category_id: 'cat-2' }];
    const listPage = vi
      .fn()
      .mockResolvedValueOnce({ data: fullPage, error: null })
      .mockResolvedValueOnce({ data: shortPage, error: null });

    const { data } = await listItemIdsLinkedElsewhere(
      { itemIds: ['item-1'], excludingCategoryId: 'cat-1' },
      listPage,
    );

    expect(data).toHaveLength(1001);
    expect(listPage.mock.calls).toEqual([
      [{ itemIds: ['item-1'], excludingCategoryId: 'cat-1', after: null }],
      [
        {
          itemIds: ['item-1'],
          excludingCategoryId: 'cat-1',
          after: fullPage[999],
        },
      ],
    ]);
  });

  it('stops on the first page that errors, returning no partial data', async () => {
    const listPage = vi
      .fn()
      .mockResolvedValue({ data: null, error: new Error('boom') });

    const { data, error } = await listItemIdsLinkedElsewhere(
      { itemIds: ['item-1'], excludingCategoryId: 'cat-1' },
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

describe('canEditCategory', () => {
  const OWNER = 'owner-1';
  const GRANTEE = 'grantee-1';
  const category = (shares?: { role: 'viewer' | 'editor' }[]) => ({
    id: 'cat-1',
    name: 'Coins',
    user_id: OWNER,
    ...(shares && { category_shares: shares }),
  });

  it('lets the owner edit, with no grant at all', () => {
    expect(canEditCategory(category([]), OWNER)).toBe(true);
  });

  it('lets the owner edit, whatever role her own grants carry', () => {
    expect(canEditCategory(category([{ role: 'viewer' }]), OWNER)).toBe(true);
  });

  it('lets a grantee with an editor grant edit', () => {
    expect(canEditCategory(category([{ role: 'editor' }]), GRANTEE)).toBe(true);
  });

  it('keeps a grantee with a viewer grant read-only', () => {
    expect(canEditCategory(category([{ role: 'viewer' }]), GRANTEE)).toBe(
      false,
    );
  });

  it('keeps anyone else read-only when no share row came back', () => {
    expect(canEditCategory(category([]), GRANTEE)).toBe(false);
  });

  it('reads a missing share embed as no grant', () => {
    expect(canEditCategory(category(), GRANTEE)).toBe(false);
  });
});
