import { beforeEach, describe, expect, it } from 'vitest';

import {
  SIGNED_URL_MARGIN_MS,
  SIGNED_URL_TTL_MS,
  cacheSignedUrls,
  clearImageCache,
  forgetSignedUrls,
  getCachedSignedUrl,
  lastSignedUrl,
  unsignedPaths,
} from './imageCache';

const T0 = 1_000_000;

describe('signed URL cache', () => {
  beforeEach(clearImageCache);

  it('returns a signature that is still comfortably valid', () => {
    cacheSignedUrls([['a.webp', 'https://x/a?token=1']], T0);
    expect(getCachedSignedUrl('a.webp', T0 + 1000)).toBe('https://x/a?token=1');
  });

  it('returns nothing for a path it has never seen', () => {
    expect(getCachedSignedUrl('nope.webp', T0)).toBeUndefined();
  });

  // Dropped a margin before the real expiry, so an image never resolves to a URL that dies mid-render.
  it('drops a signature once it is inside the expiry margin', () => {
    cacheSignedUrls([['a.webp', 'u']], T0);
    const justInside = T0 + SIGNED_URL_TTL_MS - SIGNED_URL_MARGIN_MS - 1;
    expect(getCachedSignedUrl('a.webp', justInside)).toBe('u');

    const atMargin = T0 + SIGNED_URL_TTL_MS - SIGNED_URL_MARGIN_MS;
    expect(getCachedSignedUrl('a.webp', atMargin)).toBeUndefined();
  });

  // Spelled out, not derived from the constants: a derived expectation agrees with whatever they become.
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

  // Kept past its margin as the last resort a card shows while re-signing it fails.
  it('keeps an aged-out signature only as the last one signed', () => {
    cacheSignedUrls([['a.webp', 'u']], T0);
    expect(
      getCachedSignedUrl('a.webp', T0 + SIGNED_URL_TTL_MS),
    ).toBeUndefined();
    expect(lastSignedUrl('a.webp')).toBe('u');
    expect(unsignedPaths(['a.webp'], T0 + SIGNED_URL_TTL_MS)).toEqual([
      'a.webp',
    ]);
  });

  it('has no last signature for a path it has never seen', () => {
    expect(lastSignedUrl('nope.webp')).toBeUndefined();
  });

  it('replaces an aged-out signature with a fresh one, stamped when it was signed', () => {
    cacheSignedUrls([['a.webp', 'old']], T0);
    const later = T0 + SIGNED_URL_TTL_MS;
    cacheSignedUrls([['a.webp', 'new']], later);
    expect(lastSignedUrl('a.webp')).toBe('new');
    expect(getCachedSignedUrl('a.webp', later + 1000)).toBe('new');
  });

  it('forgets exactly the paths it is told to', () => {
    cacheSignedUrls(
      [
        ['gone.webp', 'u'],
        ['kept.webp', 'v'],
      ],
      T0,
    );
    forgetSignedUrls(['gone.webp']);
    expect(lastSignedUrl('gone.webp')).toBeUndefined();
    expect(getCachedSignedUrl('kept.webp', T0)).toBe('v');
  });
});

describe('unsignedPaths', () => {
  beforeEach(clearImageCache);

  // Re-signing a still-valid path changes its URL and throws away the bytes the browser holds.
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
