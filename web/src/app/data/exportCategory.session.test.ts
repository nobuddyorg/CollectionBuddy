import { describe, expect, it, vi } from 'vitest';

import { exportCategory } from './exportCategory';

// Every other test in exportCategory.test.ts injects its own session reader,
// which leaves the default -- the one real Supabase call this module makes --
// never executed. This file exercises that default and nothing else.
const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('../supabase', () => ({ supabase: { auth: { getSession } } }));

const emptyPage = (async () => ({ data: [], error: null })) as never;

function runExport() {
  return exportCategory({
    category: { id: 'cat', name: 'Coins' },
    listItems: async () => ({
      data: { items: [], next: null },
      error: null,
    }),
    listImages: emptyPage,
    signUrls: emptyPage,
  });
}

describe('exportCategory with no session reader injected', () => {
  it('asks the real client who is signed in', async () => {
    getSession.mockResolvedValue({
      data: { session: { user: { id: 'uid-1' } } },
    });

    const result = await runExport();

    expect(getSession).toHaveBeenCalled();
    expect(result.filename).toMatch(/^CollectionBuddy-coins-/);
  });

  it('refuses to export at all when that client reports nobody signed in', async () => {
    getSession.mockResolvedValue({ data: { session: null } });

    await expect(runExport()).rejects.toThrow('No user session');
  });
});
