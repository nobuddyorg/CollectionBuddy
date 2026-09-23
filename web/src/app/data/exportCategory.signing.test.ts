import { describe, expect, it, vi } from 'vitest';

import {
  exportCategory,
  signAll,
  SIGN_BATCH_SIZE,
  SIGN_CONCURRENCY,
} from './exportCategory';
import type { ExportItem } from './exportFormat';
import type { supabase } from '../supabase';

type GetSession = () => ReturnType<typeof supabase.auth.getSession>;
type ListItems = Parameters<typeof exportCategory>[0]['listItems'];
type ListImages = Parameters<typeof exportCategory>[0]['listImages'];
type SignUrls = Parameters<typeof exportCategory>[0]['signUrls'];

function item(overrides: Partial<ExportItem> = {}): ExportItem {
  return {
    id: 'item-1',
    title: 'Item',
    description: null,
    place: null,
    place_lat: null,
    place_lng: null,
    tags: [],
    created_at: '2026-01-02T03:04:05.000Z',
    ...overrides,
  };
}

// Only `data.session.user.id` is ever read, so that's all the fake carries.
function fakeGetSession(uid: string | null): GetSession {
  return (async () => ({
    data: { session: uid ? { user: { id: uid } } : null },
  })) as unknown as GetSession;
}

// Pages a fixed array by cursor as listItemsForExport does: a full page points at its last item.
function paginatedListItems(allItems: ExportItem[]): ListItems {
  return vi.fn(
    async (page: { after: { itemId: string } | null; size: number }) => {
      const start = page.after
        ? allItems.findIndex((entry) => entry.id === page.after!.itemId) + 1
        : 0;
      const items = allItems.slice(start, start + page.size);
      const next =
        items.length === page.size
          ? { linkedAt: 'at', itemId: items[items.length - 1].id }
          : null;
      return { data: { items, next }, error: null };
    },
  );
}

// Keyed by item id, building the `uid/itemId/name` path shape a real row carries; `size_bytes` null.
function fakeListImages(byItemId: Record<string, string[]>): ListImages {
  return async (itemIds: string[]) => ({
    data: itemIds.flatMap((itemId) =>
      (byItemId[itemId] ?? []).map((name) => ({
        item_id: itemId,
        path_full: `uid/${itemId}/${name}`,
        size_bytes: null,
      })),
    ),
    error: null,
  });
}

function okResponse(bytes: number[]): Response {
  return new Response(new Uint8Array(bytes));
}

describe('exportCategory, signing the photograph URLs', () => {
  it('skips every photograph a signing call came back empty for', async () => {
    const signUrls = (async () => ({
      data: [],
      error: null,
    })) as unknown as SignUrls;
    const result = await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      getSession: fakeGetSession('uid'),
      listItems: paginatedListItems([item({ id: 'a' })]),
      listImages: fakeListImages({ a: ['1.webp'] }),
      signUrls,
    });
    expect(result.skippedPhotoCount).toBe(1);
    expect(result.photoCount).toBe(0);
  });

  it('ignores a signed-URL row missing either half, rather than keying the map on a null', async () => {
    const signUrls = (async (paths: string[]) => ({
      data: [
        { path: paths[0], signedUrl: null },
        { path: null, signedUrl: 'https://example.test/orphan' },
      ],
      error: null,
    })) as unknown as SignUrls;
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    try {
      const result = await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' })]),
        listImages: fakeListImages({ a: ['1.webp'] }),
        signUrls,
      });

      expect(result.skippedPhotoCount).toBe(1);
      expect(result.photoCount).toBe(0);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('leaves no entry at all for a path Storage could not sign', async () => {
    const signUrls = (async (paths: string[]) => ({
      data: [
        { path: paths[0], signedUrl: 'https://example.test/0' },
        { path: paths[1], signedUrl: null },
        { path: null, signedUrl: 'https://example.test/orphan' },
      ],
      error: null,
    })) as unknown as SignUrls;

    const signed = await signAll({
      paths: ['a', 'b', 'c'],
      signUrls: signUrls!,
    });

    // Not "b maps to null" and not "null maps to something": a half-filled row could not be signed.
    expect([...signed]).toEqual([['a', 'https://example.test/0']]);
  });

  it('throws when signing fails, rather than exporting with unreadable photo URLs', async () => {
    const signingError = { message: 'signing failed' };
    const signUrls = (async () => ({
      data: null,
      error: signingError,
    })) as unknown as SignUrls;
    const failure = exportCategory({
      category: { id: 'cat', name: 'Coins' },
      getSession: fakeGetSession('uid'),
      listItems: paginatedListItems([item({ id: 'a' })]),
      listImages: fakeListImages({ a: ['1.webp'] }),
      signUrls,
    });
    await expect(failure).rejects.toThrow('Could not sign photograph URLs');
    await expect(failure).rejects.toHaveProperty('cause', signingError);
  });

  it('signs in batches of SIGN_BATCH_SIZE, without an extra empty call at the boundary', async () => {
    const paths = Array.from(
      { length: SIGN_BATCH_SIZE + 50 },
      (_, i) => `uid/a/${i}.webp`,
    );
    const signUrls = vi.fn(async (batch: string[]) => ({
      data: batch.map((path) => ({ path, signedUrl: `signed://${path}` })),
      error: null,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    try {
      await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' })]),
        listImages: fakeListImages({
          a: paths.map((path) => path.split('/').at(-1)!),
        }),
        signUrls: signUrls as unknown as SignUrls,
      });

      // Two calls (100, then 50): not three (an empty extra page), not one (all at once).
      expect(signUrls).toHaveBeenCalledTimes(2);
      expect(signUrls.mock.calls[0][0]).toHaveLength(SIGN_BATCH_SIZE);
      expect(signUrls.mock.calls[1][0]).toHaveLength(50);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not ask for a trailing empty batch when the count is an exact multiple of SIGN_BATCH_SIZE', async () => {
    const paths = Array.from(
      { length: SIGN_BATCH_SIZE },
      (_, i) => `${i}.webp`,
    );
    const signUrls = vi.fn(async (batch: string[]) => ({
      data: batch.map((path) => ({ path, signedUrl: `signed://${path}` })),
      error: null,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    try {
      await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'a' })]),
        listImages: fakeListImages({ a: paths }),
        signUrls: signUrls as unknown as SignUrls,
      });
      // An off-by-one the other way (<=) would ask for a second, empty batch.
      expect(signUrls).toHaveBeenCalledOnce();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps at most SIGN_CONCURRENCY sign calls in flight', async () => {
    const paths = Array.from(
      { length: SIGN_BATCH_SIZE * (SIGN_CONCURRENCY + 2) },
      (_, i) => `p${i}`,
    );
    let inFlight = 0;
    let peak = 0;
    const signUrls = (async (batch: string[]) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight--;
      return {
        data: batch.map((path) => ({ path, signedUrl: `signed://${path}` })),
        error: null,
      };
    }) as unknown as SignUrls;

    const signed = await signAll({ paths, signUrls: signUrls! });

    expect(signed.size).toBe(paths.length);
    expect(peak).toBe(SIGN_CONCURRENCY);
  });

  it('stops asking to sign once a batch has failed', async () => {
    const paths = Array.from(
      { length: SIGN_BATCH_SIZE * (SIGN_CONCURRENCY + 4) },
      (_, i) => `p${i}`,
    );
    const signUrls = vi.fn(async () => ({
      data: null,
      error: { message: 'signing failed' },
    }));

    await expect(
      signAll({
        paths,
        signUrls: signUrls as unknown as NonNullable<SignUrls>,
      }),
    ).rejects.toThrow('Could not sign photograph URLs');
    expect(signUrls.mock.calls.length).toBeLessThan(SIGN_CONCURRENCY + 4);
  });
});
