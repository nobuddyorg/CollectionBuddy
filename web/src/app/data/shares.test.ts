import { describe, expect, it, vi } from 'vitest';

import { supabase } from '../supabase';
import { createShare, deleteShare, listSharesForCategory } from './shares';

// Same reasoning as categories.test.ts: each function here only builds a
// query and hands it back for the caller to await, so what's worth
// asserting is the shape of the query it built -- which table, which
// columns, which filters -- not a resolved value that would just echo the
// mock back at itself.

type Call = { method: string; args: unknown[] };

function mockQueryBuilder() {
  const calls: Call[] = [];
  const methods = [
    'select',
    'insert',
    'delete',
    'eq',
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

describe('listSharesForCategory', () => {
  it('selects grant columns for exactly the given category', () => {
    const { from, calls } = mockFrom();
    listSharesForCategory('cat-1');
    expect(from).toHaveBeenCalledWith('category_shares');
    expect(calls[0]).toEqual({
      method: 'select',
      args: ['id,invited_email,expires_at,owner_user_id'],
    });
    expect(calls[1]).toEqual({ method: 'eq', args: ['category_id', 'cat-1'] });
  });
});

describe('createShare', () => {
  it('inserts category_id, invited_email and expires_at, leaving owner_user_id to the enforce trigger', () => {
    const { from, calls } = mockFrom();
    createShare('cat-1', 'grantee@example.com', null);
    expect(from).toHaveBeenCalledWith('category_shares');
    expect(calls[0]).toEqual({
      method: 'insert',
      args: [
        {
          category_id: 'cat-1',
          invited_email: 'grantee@example.com',
          expires_at: null,
        },
      ],
    });
    expect(calls[1]).toEqual({
      method: 'select',
      args: ['id,invited_email,expires_at,owner_user_id'],
    });
    expect(calls[2].method).toBe('single');
  });

  it('carries an expiry through unchanged when one is given', () => {
    const { calls } = mockFrom();
    createShare('cat-1', 'grantee@example.com', '2026-12-31T00:00:00.000Z');
    expect(calls[0]).toEqual({
      method: 'insert',
      args: [
        {
          category_id: 'cat-1',
          invited_email: 'grantee@example.com',
          expires_at: '2026-12-31T00:00:00.000Z',
        },
      ],
    });
  });
});

describe('deleteShare', () => {
  it('deletes exactly the given grant', () => {
    const { from, calls } = mockFrom();
    deleteShare('share-1');
    expect(from).toHaveBeenCalledWith('category_shares');
    expect(calls[0].method).toBe('delete');
    expect(calls[1]).toEqual({ method: 'eq', args: ['id', 'share-1'] });
  });
});
