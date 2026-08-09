import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cacheSignedUrls,
  clearImageCache,
  getCachedSignedUrl,
} from './imageCache';
import { pairImageEntries, signEntries, toImgEntries } from './useItemImages';
import type { ImageEntryData } from './useItemImages';

describe('pairImageEntries', () => {
  const prefix = 'user-1/item-1';

  it('pairs a full image with its thumbnail', () => {
    const result = pairImageEntries(
      [{ name: 'abc.webp' }, { name: 'abc.thumb.webp' }],
      prefix,
    );
    expect(result.get('abc')).toEqual({
      pathFull: `${prefix}/abc.webp`,
      pathThumb: `${prefix}/abc.thumb.webp`,
    });
  });

  it('keeps a full image with no thumbnail, with pathThumb undefined', () => {
    const result = pairImageEntries([{ name: 'solo.webp' }], prefix);
    expect(result.get('solo')).toEqual({
      pathFull: `${prefix}/solo.webp`,
      pathThumb: undefined,
    });
  });

  it('drops an orphaned thumbnail with no matching full image', () => {
    const result = pairImageEntries([{ name: 'orphan.thumb.webp' }], prefix);
    expect(result.has('orphan')).toBe(false);
    expect(result.size).toBe(0);
  });

  it('is unaffected by listing order', () => {
    const thumbFirst = pairImageEntries(
      [{ name: 'xyz.thumb.webp' }, { name: 'xyz.webp' }],
      prefix,
    );
    expect(thumbFirst.get('xyz')).toEqual({
      pathFull: `${prefix}/xyz.webp`,
      pathThumb: `${prefix}/xyz.thumb.webp`,
    });
  });

  it('strips only a trailing .thumb.webp, not an earlier occurrence of the same text', () => {
    const result = pairImageEntries(
      [
        { name: 'photo.thumb.webp-1.webp' },
        { name: 'photo.thumb.webp-1.thumb.webp' },
      ],
      prefix,
    );
    expect(result.get('photo.thumb.webp-1')).toEqual({
      pathFull: `${prefix}/photo.thumb.webp-1.webp`,
      pathThumb: `${prefix}/photo.thumb.webp-1.thumb.webp`,
    });
  });

  it('strips only a trailing .webp, not an earlier occurrence of the same text', () => {
    const result = pairImageEntries([{ name: 'photo.webp-1.webp' }], prefix);
    expect(result.has('photo.webp-1')).toBe(true);
  });

  it('treats an object with neither suffix as a full image, keyed by its whole name', () => {
    const result = pairImageEntries([{ name: 'unexpected-name' }], prefix);
    expect(result.get('unexpected-name')).toEqual({
      pathFull: `${prefix}/unexpected-name`,
      pathThumb: undefined,
    });
  });

  // The grid hangs its photographs in this order and stands an upload's
  // placeholder at the end, so a listing that arrives oldest-first has to stay
  // oldest-first through here -- otherwise the new picture lands somewhere
  // other than the frame that was held for it (#265).
  it('carries listing order through to the paired entries', () => {
    const result = pairImageEntries(
      [
        { name: 'oldest.webp' },
        { name: 'oldest.thumb.webp' },
        { name: 'middle.webp' },
        { name: 'middle.thumb.webp' },
        { name: 'newest.webp' },
        { name: 'newest.thumb.webp' },
      ],
      prefix,
    );
    expect(Array.from(result.keys())).toEqual(['oldest', 'middle', 'newest']);
  });

  // A card can be given a second photograph while the first is still
  // compressing, so two uploads can interleave their full and thumb objects in
  // the listing. Each image still takes its place from where its full-size
  // object falls -- the one uploaded first of the pair, and so the first of
  // that base the listing shows.
  it('keeps each image in place when two uploads interleave', () => {
    const result = pairImageEntries(
      [
        { name: 'first.webp' },
        { name: 'second.webp' },
        { name: 'second.thumb.webp' },
        { name: 'first.thumb.webp' },
      ],
      prefix,
    );
    expect(Array.from(result.keys())).toEqual(['first', 'second']);
  });

  it('pairs multiple independent images from one flat listing', () => {
    const result = pairImageEntries(
      [
        { name: 'a.webp' },
        { name: 'a.thumb.webp' },
        { name: 'b.webp' },
        { name: 'b.thumb.webp' },
      ],
      prefix,
    );
    expect(result.size).toBe(2);
    expect(result.get('a')?.pathThumb).toBe(`${prefix}/a.thumb.webp`);
    expect(result.get('b')?.pathThumb).toBe(`${prefix}/b.thumb.webp`);
  });
});

describe('toImgEntries', () => {
  const entryData = new Map([
    ['a', { pathFull: 'p/a.webp', pathThumb: 'p/a.thumb.webp' }],
    ['b', { pathFull: 'p/b.webp', pathThumb: undefined }],
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
        pathFull: 'p/a.webp',
        urlFull: 'https://signed/a',
        pathThumb: 'p/a.thumb.webp',
        urlThumb: 'https://signed/a-thumb',
      },
      {
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
    return new Map([['only', { pathFull, pathThumb }]]);
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
