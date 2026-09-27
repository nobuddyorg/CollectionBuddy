import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

import { SIGN_URLS_BATCH_SIZE } from '../../data/images';
import {
  SIGNED_URL_MARGIN_MS,
  SIGNED_URL_TTL_MS,
  cacheSignedUrls,
  clearImageCache,
  getCachedSignedUrl,
  lastSignedUrl,
} from './imageCache';
import {
  itemsDueForResigning,
  keepingShown,
  signEntries,
  type ImageEntryData,
} from './imageEntries';
import type { ImageEntry } from './types';

const T0 = 1_000_000_000;
const DUE_AFTER = SIGNED_URL_TTL_MS - SIGNED_URL_MARGIN_MS;

function onePhotograph(
  pathFull: string,
  pathThumb?: string,
): Map<string, ImageEntryData> {
  return new Map([['only', { id: 'only', pathFull, pathThumb }]]);
}

function signsEverything() {
  return vi.fn(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://fresh/${path}` })),
    error: null,
  }));
}

function refusesToSign() {
  return vi.fn(async () => ({ data: null, error: new Error('offline') }));
}

function shown(pathFull: string, pathThumb?: string): ImageEntry {
  return {
    id: pathFull,
    pathFull,
    urlFull: `https://signed/${pathFull}`,
    pathThumb,
    urlThumb: pathThumb ? `https://signed/${pathThumb}` : undefined,
  };
}

// Spelled out, not derived from the constant: Storage's own cap, which a derived expectation would follow anywhere.
it('signs at most 1,000 paths per request, as Storage allows', () => {
  expect(SIGN_URLS_BATCH_SIZE).toBe(1000);
});

describe('signing a session-sized set of photographs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    clearImageCache();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // 501 photographs with thumbnails: 1,002 paths, two past what one request may carry.
  function manyItems() {
    return Array.from(
      { length: 501 },
      (_, i) =>
        [
          `item-${i}`,
          onePhotograph(`p/${i}.webp`, `p/${i}.thumb.webp`),
        ] as const,
    );
  }

  it('splits the signing into requests Storage accepts, and signs every path', async () => {
    const signUrls = signsEverything();

    const result = await signEntries(manyItems(), signUrls as never);

    expect(signUrls.mock.calls.map(([paths]) => paths.length)).toEqual([
      1000, 2,
    ]);
    expect(result['item-500'][0].urlThumb).toBe(
      'https://fresh/p/500.thumb.webp',
    );
  });

  it('keeps what a successful request signed when another request fails', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const signUrls = vi
      .fn()
      .mockImplementationOnce(signsEverything())
      .mockImplementationOnce(refusesToSign());

    const result = await signEntries(manyItems(), signUrls);

    expect(result['item-0'][0].urlFull).toBe('https://fresh/p/0.webp');
    // The failed request's photograph had never been signed, so there is nothing to show for it.
    expect(result['item-500']).toEqual([]);
    consoleError.mockRestore();
  });
});

describe('re-signing that fails', () => {
  let consoleError: MockInstance<typeof console.error>;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + DUE_AFTER);
    clearImageCache();
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleError.mockRestore();
    vi.useRealTimers();
  });

  it('keeps showing the last signature rather than blanking the card, and leaves it due', async () => {
    cacheSignedUrls([['p/a.webp', 'https://old/a']], T0);

    const result = await signEntries(
      [['item-1', onePhotograph('p/a.webp')]],
      refusesToSign() as never,
    );

    expect(result['item-1'][0].urlFull).toBe('https://old/a');
    expect(getCachedSignedUrl('p/a.webp')).toBeUndefined();
  });

  it('does not hand an aged-out signature to a photograph it never tried to sign', async () => {
    cacheSignedUrls([['p/6.webp', 'https://old/6']], T0);
    const sevenPhotos = new Map(
      Array.from({ length: 7 }, (_, i) => [
        `img-${i}`,
        { id: `img-${i}`, pathFull: `p/${i}.webp` },
      ]),
    );

    const result = await signEntries(
      [['item-1', sevenPhotos]],
      refusesToSign() as never,
    );

    // Past the plates it stays unsigned, so opening the carousel signs it afresh.
    expect(result['item-1']).toEqual([
      { id: 'img-5', pathFull: 'p/5.webp' },
      { id: 'img-6', pathFull: 'p/6.webp' },
    ]);
  });

  it('forgets a signature Storage no longer grants, so no dead photograph lingers', async () => {
    cacheSignedUrls([['p/gone.webp', 'https://old/gone']], T0);
    const signUrls = vi.fn(async () => ({
      data: [{ path: 'p/gone.webp', signedUrl: null, error: 'not found' }],
      error: null,
    }));

    const result = await signEntries(
      [['item-1', onePhotograph('p/gone.webp')]],
      signUrls as never,
    );

    expect(result['item-1']).toEqual([]);
    expect(lastSignedUrl('p/gone.webp')).toBeUndefined();
  });
});

describe('itemsDueForResigning', () => {
  beforeEach(clearImageCache);

  it('names nothing while every shown signature is fresh', () => {
    cacheSignedUrls([['p/a.webp', 'u']], T0);
    expect(
      itemsDueForResigning({ 'item-1': [shown('p/a.webp')] }, T0 + 1000),
    ).toEqual([]);
  });

  // The issue's case: a page re-shown from the cache carries its old signatures, and they come due on their own clock.
  it('names only the items whose own signatures come due', () => {
    cacheSignedUrls([['p/page-1.webp', 'u']], T0);
    cacheSignedUrls([['p/page-2.webp', 'u']], T0 + 50 * 60_000);

    expect(
      itemsDueForResigning(
        {
          'item-1': [shown('p/page-1.webp')],
          'item-2': [shown('p/page-2.webp')],
        },
        T0 + DUE_AFTER,
      ),
    ).toEqual(['item-1']);
  });

  it('names an item whose thumbnail alone has come due', () => {
    cacheSignedUrls([['p/a.thumb.webp', 't']], T0);
    cacheSignedUrls([['p/a.webp', 'u']], T0 + DUE_AFTER);

    expect(
      itemsDueForResigning(
        { 'item-1': [shown('p/a.webp', 'p/a.thumb.webp')] },
        T0 + DUE_AFTER,
      ),
    ).toEqual(['item-1']);
  });

  it('names an item still showing a signature a failed re-sign left behind', () => {
    cacheSignedUrls([['p/a.webp', 'u']], T0);
    expect(
      itemsDueForResigning({ 'item-1': [shown('p/a.webp')] }, T0 + DUE_AFTER),
    ).toEqual(['item-1']);
  });

  it('ignores photographs the card does not show signed', () => {
    cacheSignedUrls([['p/a.webp', 'u']], T0);
    const unsignedPastThePlates: ImageEntry = {
      id: 'img-6',
      pathFull: 'p/6.webp',
      pathThumb: 'p/6.thumb.webp',
    };
    const thumbnailNotShown: ImageEntry = {
      ...shown('p/b.webp'),
      pathThumb: 'p/b.thumb.webp',
    };
    cacheSignedUrls([['p/b.webp', 'v']], T0);

    expect(
      itemsDueForResigning(
        {
          'item-1': [shown('p/a.webp'), unsignedPastThePlates],
          'item-2': [thumbnailNotShown],
          'item-3': [],
        },
        T0 + 1000,
      ),
    ).toEqual([]);
  });
});

describe('keepingShown', () => {
  it('leaves what the listed items showed, and every other item, as it was', () => {
    const shownBefore = [shown('p/a.webp')];
    const other = [shown('p/b.webp')];

    const next = keepingShown({ 'item-1': shownBefore, 'item-2': other }, [
      'item-1',
    ]);

    expect(next['item-1']).toBe(shownBefore);
    expect(next['item-2']).toBe(other);
  });

  it('settles an item it never showed as having no photographs', () => {
    expect(keepingShown({}, ['item-1'])).toEqual({ 'item-1': [] });
  });
});
