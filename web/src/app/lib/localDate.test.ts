import { describe, expect, it } from 'vitest';

import { localDateStamp } from './localDate';

/** 01:00 UTC on the 24th, read by a browser in California, where it is still the 23rd. */
function lateEveningInCalifornia(): Date {
  return Object.assign(new Date('2026-09-24T01:00:00Z'), {
    getFullYear: () => 2026,
    getMonth: () => 8,
    getDate: () => 23,
  });
}

describe('localDateStamp', () => {
  it('formats the local date, zero-padded', () => {
    expect(localDateStamp(new Date(2026, 7, 6))).toBe('2026-08-06');
    expect(localDateStamp(new Date(2026, 0, 9))).toBe('2026-01-09');
  });

  it('reads the date the browser is having, not the one in UTC', () => {
    expect(localDateStamp(lateEveningInCalifornia())).toBe('2026-09-23');
  });
});
