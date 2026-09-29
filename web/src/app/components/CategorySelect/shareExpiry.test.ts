import { describe, expect, it } from 'vitest';

import { isShareExpired } from './shareExpiry';

const now = new Date('2026-09-28T12:00:00.000Z');

describe('isShareExpired', () => {
  it('keeps a grant whose expiry is still ahead', () => {
    expect(isShareExpired({ expiresAt: '2026-09-28T12:00:00.001Z', now })).toBe(
      false,
    );
  });

  it('counts a grant as expired at its expiry instant', () => {
    expect(isShareExpired({ expiresAt: '2026-09-28T12:00:00.000Z', now })).toBe(
      true,
    );
  });

  it('counts a grant whose expiry has passed as expired', () => {
    expect(isShareExpired({ expiresAt: '2026-09-27T23:59:59.000Z', now })).toBe(
      true,
    );
  });
});
