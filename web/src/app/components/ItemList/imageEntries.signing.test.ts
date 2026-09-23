import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cacheSignedUrls,
  clearImageCache,
  getCachedSignedUrl,
} from './imageCache';
import {
  entryDataOf,
  signAllEntries,
  signEntries,
  type ImageEntryData,
} from './imageEntries';

describe('signEntries', () => {
  beforeEach(() => {
    clearImageCache();
  });

  function entries(
    pathFull: string,
    pathThumb?: string,
  ): Map<string, ImageEntryData> {
    return new Map([['only', { id: 'only', pathFull, pathThumb }]]);
  }

  it('signs unsigned paths and returns each item keyed to its signed URL, including a thumbnail', async () => {
    const signUrls = vi.fn().mockResolvedValue({
      data: [
        { path: 'p/1/a.webp', signedUrl: 'https://signed/a' },
        { path: 'p/1/a.thumb.webp', signedUrl: 'https://signed/a-thumb' },
      ],
      error: null,
    });

    const result = await signEntries(
      [['item-1', entries('p/1/a.webp', 'p/1/a.thumb.webp')]],
      signUrls,
    );

    expect(signUrls).toHaveBeenCalledWith(['p/1/a.webp', 'p/1/a.thumb.webp']);
    expect(result['item-1']).toEqual([
      {
        id: 'only',
        pathFull: 'p/1/a.webp',
        urlFull: 'https://signed/a',
        pathThumb: 'p/1/a.thumb.webp',
        urlThumb: 'https://signed/a-thumb',
      },
    ]);
    // Cached, not just returned: skipping a second caller for the same path is the point.
    expect(getCachedSignedUrl('p/1/a.webp')).toBe('https://signed/a');
  });

  it('never calls signUrls when every path is already cached', async () => {
    cacheSignedUrls([['p/2/a.webp', 'https://signed/cached']]);
    const signUrls = vi.fn();

    const result = await signEntries(
      [['item-2', entries('p/2/a.webp')]],
      signUrls,
    );

    expect(signUrls).not.toHaveBeenCalled();
    expect(result['item-2']?.[0]?.urlFull).toBe('https://signed/cached');
  });

  it('logs and falls back to whatever is already cached when signing fails', async () => {
    cacheSignedUrls([['p/3/stale.webp', 'https://signed/stale']]);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const signUrls = vi.fn().mockResolvedValue({
      data: null,
      error: new Error('rate limited'),
    });

    const result = await signEntries(
      [
        ['item-3a', entries('p/3/stale.webp')],
        ['item-3b', entries('p/3/new.webp')],
      ],
      signUrls,
    );

    expect(consoleError).toHaveBeenCalledWith(
      'Failed to create signed URLs',
      expect.any(Error),
    );
    // The cached signature keeps showing; the one that never arrived is dropped, not shown undefined.
    expect(result['item-3a']?.[0]?.urlFull).toBe('https://signed/stale');
    expect(result['item-3b']).toEqual([]);
    consoleError.mockRestore();
  });

  it('ignores a signed-url response entry missing a path or a URL', async () => {
    const signUrls = vi.fn().mockResolvedValue({
      data: [
        { path: 'p/4/a.webp', signedUrl: null },
        { path: null, signedUrl: 'https://signed/orphan' },
      ],
      error: null,
    });

    const result = await signEntries(
      [['item-4', entries('p/4/a.webp')]],
      signUrls,
    );

    expect(result['item-4']).toEqual([]);
    expect(getCachedSignedUrl('p/4/a.webp')).toBeUndefined();
  });

  it('gives an item with no entries an empty array rather than omitting it', async () => {
    const signUrls = vi.fn().mockResolvedValue({ data: [], error: null });

    const result = await signEntries(
      [['item-5', new Map<string, ImageEntryData>()]],
      signUrls,
    );

    expect(signUrls).not.toHaveBeenCalled();
    expect(result['item-5']).toEqual([]);
  });
});

// Seven photographs of one item: more than a card's hero and strip can show.
function sevenPhotos(): Map<string, ImageEntryData> {
  return new Map(
    Array.from({ length: 7 }, (_, i) => [
      `img-${i}`,
      {
        id: `img-${i}`,
        pathFull: `p/${i}.webp`,
        pathThumb: `p/${i}.thumb.webp`,
      },
    ]),
  );
}

function signsEverything() {
  return vi.fn(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })),
    error: null,
  }));
}

describe('signing only what a card can render', () => {
  beforeEach(() => {
    clearImageCache();
  });

  it("signs each item's first five photographs and keeps the rest unsigned", async () => {
    const signUrls = signsEverything();

    const result = await signEntries(
      [['item-1', sevenPhotos()]],
      signUrls as never,
    );

    expect(signUrls).toHaveBeenCalledOnce();
    expect(signUrls.mock.calls[0][0]).toEqual(
      Array.from({ length: 5 }, (_, i) => [
        `p/${i}.webp`,
        `p/${i}.thumb.webp`,
      ]).flat(),
    );
    expect(result['item-1']).toHaveLength(7);
    expect(result['item-1'].map((entry) => Boolean(entry.urlFull))).toEqual([
      true,
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it('uses a signature already cached for a photograph past the plates', async () => {
    cacheSignedUrls([['p/6.webp', 'https://cached/6']]);

    const result = await signEntries(
      [['item-1', sevenPhotos()]],
      signsEverything() as never,
    );

    expect(result['item-1'][6].urlFull).toBe('https://cached/6');
  });

  it('tops up every photograph for the carousel, signing only what is missing', async () => {
    const first = await signEntries(
      [['item-1', sevenPhotos()]],
      signsEverything() as never,
    );
    const signUrls = signsEverything();

    const result = await signAllEntries(
      [['item-1', entryDataOf(first['item-1'])]],
      signUrls as never,
    );

    expect(signUrls.mock.calls[0][0]).toEqual([
      'p/5.webp',
      'p/5.thumb.webp',
      'p/6.webp',
      'p/6.thumb.webp',
    ]);
    expect(result['item-1'].every((entry) => entry.urlFull)).toBe(true);
    // Already-signed plates keep the signature they had.
    expect(result['item-1'][0].urlFull).toBe(first['item-1'][0].urlFull);
  });
});
