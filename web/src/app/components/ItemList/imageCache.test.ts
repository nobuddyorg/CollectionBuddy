import { beforeEach, describe, expect, it } from 'vitest';

import {
  LISTING_TTL_MS,
  SIGNED_URL_MARGIN_MS,
  SIGNED_URL_TTL_MS,
  cacheListing,
  cacheSignedUrls,
  clearImageCache,
  getCachedListing,
  getCachedSignedUrl,
  invalidateListing,
  unsignedPaths,
} from './imageCache';
import type { ImageEntryData } from './useItemImages';

const T0 = 1_000_000;
const entry = (n: string): Map<string, ImageEntryData> =>
  new Map([[n, { pathFull: `${n}.webp` }]]);

describe('signed URL cache', () => {
  beforeEach(clearImageCache);

  it('returns a signature that is still comfortably valid', () => {
    cacheSignedUrls([['a.webp', 'https://x/a?token=1']], T0);
    expect(getCachedSignedUrl('a.webp', T0 + 1000)).toBe('https://x/a?token=1');
  });

  it('returns nothing for a path it has never seen', () => {
    expect(getCachedSignedUrl('nope.webp', T0)).toBeUndefined();
  });

  // Dropped a safety margin before the real expiry so an image can never
  // resolve to a URL that dies mid-render.
  it('drops a signature once it is inside the expiry margin', () => {
    cacheSignedUrls([['a.webp', 'u']], T0);
    const justInside = T0 + SIGNED_URL_TTL_MS - SIGNED_URL_MARGIN_MS - 1;
    expect(getCachedSignedUrl('a.webp', justInside)).toBe('u');

    const atMargin = T0 + SIGNED_URL_TTL_MS - SIGNED_URL_MARGIN_MS;
    expect(getCachedSignedUrl('a.webp', atMargin)).toBeUndefined();
  });

  // Spelled out in minutes rather than computed from the constants, because
  // an expectation derived from the thing under test agrees with whatever it
  // becomes: the margin could shrink to a fraction of a millisecond and the
  // test above would still pass. These are the durations Supabase actually
  // signs for and the head start the app actually wants.
  it('signs for an hour and keeps five minutes of it in hand', () => {
    const ONE_HOUR = 60 * 60_000;
    const FIVE_MINUTES = 5 * 60_000;
    expect(SIGNED_URL_TTL_MS).toBe(ONE_HOUR);
    expect(SIGNED_URL_MARGIN_MS).toBe(FIVE_MINUTES);

    cacheSignedUrls([['a.webp', 'u']], T0);
    // A second before the margin opens, still good.
    expect(getCachedSignedUrl('a.webp', T0 + ONE_HOUR - FIVE_MINUTES - 1)).toBe(
      'u',
    );
    // The moment it opens, gone -- five whole minutes before the real expiry.
    expect(
      getCachedSignedUrl('a.webp', T0 + ONE_HOUR - FIVE_MINUTES),
    ).toBeUndefined();
  });

  it('forgets an expired entry rather than re-checking it forever', () => {
    cacheSignedUrls([['a.webp', 'u']], T0);
    getCachedSignedUrl('a.webp', T0 + SIGNED_URL_TTL_MS);
    // Even asked about at the original time again, it is gone.
    expect(getCachedSignedUrl('a.webp', T0)).toBeUndefined();
  });
});

describe('unsignedPaths', () => {
  beforeEach(clearImageCache);

  // Re-signing a path that already has a valid signature changes its URL,
  // which throws away the copy of the bytes the browser already holds.
  it('asks only for paths without a usable signature', () => {
    cacheSignedUrls([['have.webp', 'u']], T0);
    expect(unsignedPaths(['have.webp', 'missing.webp'], T0)).toEqual([
      'missing.webp',
    ]);
  });

  it('returns nothing when everything is already signed', () => {
    cacheSignedUrls(
      [
        ['a.webp', 'u'],
        ['b.webp', 'u'],
      ],
      T0,
    );
    expect(unsignedPaths(['a.webp', 'b.webp'], T0)).toEqual([]);
  });

  it('de-duplicates so a repeated path is not signed twice', () => {
    expect(unsignedPaths(['a.webp', 'a.webp'], T0)).toEqual(['a.webp']);
  });

  it('asks again for paths whose signature has aged out', () => {
    cacheSignedUrls([['a.webp', 'u']], T0);
    expect(unsignedPaths(['a.webp'], T0 + SIGNED_URL_TTL_MS)).toEqual([
      'a.webp',
    ]);
  });
});

describe('listing cache', () => {
  beforeEach(clearImageCache);

  it('returns a listing within its window', () => {
    cacheListing('uid/item', entry('a'), T0);
    expect(getCachedListing('uid/item', T0 + 1000)).toEqual(entry('a'));
  });

  it('expires a listing after its window', () => {
    cacheListing('uid/item', entry('a'), T0);
    expect(getCachedListing('uid/item', T0 + LISTING_TTL_MS)).toBeUndefined();
  });

  // Uploads and deletes change what exists, so the cached answer for that
  // item is exactly the thing that just went stale.
  it('drops a listing on demand', () => {
    cacheListing('uid/item', entry('a'), T0);
    invalidateListing('uid/item');
    expect(getCachedListing('uid/item', T0)).toBeUndefined();
  });

  it('keeps other items when one is invalidated', () => {
    cacheListing('uid/one', entry('a'), T0);
    cacheListing('uid/two', entry('b'), T0);
    invalidateListing('uid/one');
    expect(getCachedListing('uid/two', T0)).toEqual(entry('b'));
  });
});
