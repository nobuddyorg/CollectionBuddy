import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  exportCategory,
  signAll,
  SIGN_BATCH_SIZE,
  SIGN_CONCURRENCY,
} from './exportCategory';
import {
  type SignUrls,
  item,
  paginatedListItems,
  fakeSignUrls,
  okResponse,
} from './exportCategory.test-support';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('exportCategory, signing the photograph URLs', () => {
  it('skips every photograph a signing call came back empty for', async () => {
    const signUrls = (async () => ({
      data: [],
      error: null,
    })) as unknown as SignUrls;
    const result = await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      listItems: paginatedListItems([item({ id: 'a' })], { a: ['1.webp'] }),
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
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      listItems: paginatedListItems([item({ id: 'a' })], { a: ['1.webp'] }),
      signUrls,
    });

    expect(result.skippedPhotoCount).toBe(1);
    expect(result.photoCount).toBe(0);
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
    const signingError = {
      message: 'signing failed',
      status: 400,
      statusCode: '403',
    };
    const signUrls = (async () => ({
      data: null,
      error: signingError,
    })) as unknown as SignUrls;
    const failure = exportCategory({
      category: { id: 'cat', name: 'Coins' },
      listItems: paginatedListItems([item({ id: 'a' })], { a: ['1.webp'] }),
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
    const signUrls = fakeSignUrls();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      listItems: paginatedListItems([item({ id: 'a' })], {
        a: paths.map((path) => path.split('/').at(-1)!),
      }),
      signUrls,
    });

    // Two calls (100, then 50): not three (an empty extra page), not one (all at once).
    expect(signUrls).toHaveBeenCalledTimes(2);
    expect(signUrls.mock.calls[0][0]).toHaveLength(SIGN_BATCH_SIZE);
    expect(signUrls.mock.calls[1][0]).toHaveLength(50);
  });

  it('does not ask for a trailing empty batch when the count is an exact multiple of SIGN_BATCH_SIZE', async () => {
    const paths = Array.from(
      { length: SIGN_BATCH_SIZE },
      (_, i) => `${i}.webp`,
    );
    const signUrls = fakeSignUrls();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      listItems: paginatedListItems([item({ id: 'a' })], { a: paths }),
      signUrls,
    });
    // An off-by-one the other way (<=) would ask for a second, empty batch.
    expect(signUrls).toHaveBeenCalledOnce();
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
      error: { message: 'signing failed', status: 400, statusCode: '403' },
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
