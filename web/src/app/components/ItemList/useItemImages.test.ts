import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cacheSignedUrls,
  clearImageCache,
  getCachedSignedUrl,
} from './imageCache';
import { groupImageRows, signEntries, toImgEntries } from './useItemImages';
import type { ImageEntryData } from './useItemImages';

describe('groupImageRows', () => {
  it("groups a row by item, keyed by the row's own id", () => {
    const result = groupImageRows([
      {
        id: 'img-1',
        item_id: 'item-1',
        path_full: 'p/1/a.webp',
        path_thumb: 'p/1/a.thumb.webp',
      },
    ]);
    expect(result.get('item-1')?.get('img-1')).toEqual({
      id: 'img-1',
      pathFull: 'p/1/a.webp',
      pathThumb: 'p/1/a.thumb.webp',
    });
  });

  it('leaves pathThumb undefined for a row with none', () => {
    const result = groupImageRows([
      {
        id: 'img-1',
        item_id: 'item-1',
        path_full: 'p/1/a.webp',
        path_thumb: null,
      },
    ]);
    expect(result.get('item-1')?.get('img-1')?.pathThumb).toBeUndefined();
  });

  // The grid hangs its photographs in the order the query returned them, and
  // stands an upload's placeholder at the end -- so the row order coming in
  // has to survive grouping unchanged (#265).
  it("carries row order through to each item's entries", () => {
    const result = groupImageRows([
      {
        id: 'oldest',
        item_id: 'item-1',
        path_full: 'p/1/oldest.webp',
        path_thumb: null,
      },
      {
        id: 'middle',
        item_id: 'item-1',
        path_full: 'p/1/middle.webp',
        path_thumb: null,
      },
      {
        id: 'newest',
        item_id: 'item-1',
        path_full: 'p/1/newest.webp',
        path_thumb: null,
      },
    ]);
    expect(Array.from(result.get('item-1')?.keys() ?? [])).toEqual([
      'oldest',
      'middle',
      'newest',
    ]);
  });

  it('separates rows belonging to different items', () => {
    const result = groupImageRows([
      { id: 'a', item_id: 'item-1', path_full: 'p/1/a.webp', path_thumb: null },
      { id: 'b', item_id: 'item-2', path_full: 'p/2/b.webp', path_thumb: null },
    ]);
    expect(result.size).toBe(2);
    expect(result.get('item-1')?.size).toBe(1);
    expect(result.get('item-2')?.size).toBe(1);
  });

  it('returns an empty map for an empty row list', () => {
    expect(groupImageRows([]).size).toBe(0);
  });
});

describe('toImgEntries', () => {
  const entryData = new Map([
    ['a', { id: 'a', pathFull: 'p/a.webp', pathThumb: 'p/a.thumb.webp' }],
    ['b', { id: 'b', pathFull: 'p/b.webp', pathThumb: undefined }],
  ]);

  it('attaches signed URLs to both full and thumb paths', () => {
    const signed = new Map([
      ['p/a.webp', 'https://signed/a'],
      ['p/a.thumb.webp', 'https://signed/a-thumb'],
      ['p/b.webp', 'https://signed/b'],
    ]);
    const result = toImgEntries(entryData, signed);
    expect(result).toEqual([
      {
        id: 'a',
        pathFull: 'p/a.webp',
        urlFull: 'https://signed/a',
        pathThumb: 'p/a.thumb.webp',
        urlThumb: 'https://signed/a-thumb',
      },
      {
        id: 'b',
        pathFull: 'p/b.webp',
        urlFull: 'https://signed/b',
        pathThumb: undefined,
        urlThumb: undefined,
      },
    ]);
  });

  it('drops an entry whose full path has no signed URL, even if signing partially succeeded', () => {
    const signed = new Map([['p/a.thumb.webp', 'https://signed/a-thumb']]);
    const result = toImgEntries(entryData, signed);
    expect(result).toEqual([]);
  });
});

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
    // The signature is cached, not just returned -- a second caller for the
    // same path is one of the things this function exists to skip.
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

    expect(consoleError).toHaveBeenCalled();
    // The item whose signature already existed keeps showing it...
    expect(result['item-3a']?.[0]?.urlFull).toBe('https://signed/stale');
    // ...and the one that needed a fresh signature that never arrived is
    // dropped rather than shown with an undefined URL.
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
