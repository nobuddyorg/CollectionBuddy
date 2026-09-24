import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cacheSignedUrls,
  clearImageCache,
  getCachedSignedUrl,
} from './imageCache';
import {
  entryDataOf,
  groupImageRows,
  pageImageRowsFor,
  RENDERABLE_PLATES,
  signAllEntries,
  signEntries,
  STRIP_MAX,
  toImageEntries,
  type ImageEntryData,
} from './imageEntries';

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

  // The grid hangs photographs in query order with an upload's placeholder last, so order must survive.
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

describe('toImageEntries', () => {
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
    const result = toImageEntries(entryData, signed);
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
    const result = toImageEntries(entryData, signed);
    expect(result).toEqual([]);
  });
});

describe('pageImageRowsFor', () => {
  const rows = [
    { id: 'p1', item_id: 'a', path_full: 'u/a/p1.webp', path_thumb: null },
  ];

  it('hands back the carried rows for the exact item set they were read with', () => {
    expect(pageImageRowsFor({ itemIdsKey: 'a,b', rows }, 'a,b')).toBe(rows);
  });

  it('refuses them for any other item set', () => {
    expect(pageImageRowsFor({ itemIdsKey: 'a,b', rows }, 'b')).toBeNull();
  });

  it('has nothing when the read carried no rows', () => {
    expect(pageImageRowsFor(null, 'a,b')).toBeNull();
  });
});

describe('what a card can render', () => {
  it('is the hero plus a strip of four', () => {
    expect(STRIP_MAX).toBe(4);
    expect(RENDERABLE_PLATES).toBe(5);
  });
});

describe('toImageEntries past the plates', () => {
  it('keeps an unsigned photograph past the plates, so it still counts', () => {
    const result = toImageEntries(sevenPhotos(), new Map());
    // The first five are dropped unsigned, as before; the last two are kept.
    expect(result.map((entry) => entry.id)).toEqual(['img-5', 'img-6']);
    expect(result[0].urlFull).toBeUndefined();
  });
});

describe('entryDataOf', () => {
  it('gives back the paths each shown entry was signed from, in order', () => {
    const data = entryDataOf([
      {
        id: 'a',
        pathFull: 'p/a.webp',
        urlFull: 'u',
        pathThumb: 'p/a.thumb.webp',
      },
      { id: 'b', pathFull: 'p/b.webp' },
    ]);

    expect([...data]).toEqual([
      ['a', { id: 'a', pathFull: 'p/a.webp', pathThumb: 'p/a.thumb.webp' }],
      ['b', { id: 'b', pathFull: 'p/b.webp', pathThumb: undefined }],
    ]);
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
