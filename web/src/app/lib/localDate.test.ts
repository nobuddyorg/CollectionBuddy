import { describe, expect, it } from 'vitest';

import { endOfLocalDayIso, localDateStamp } from './localDate';

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

describe('endOfLocalDayIso', () => {
  it("names the day's last second in the browser's own timezone", () => {
    expect(endOfLocalDayIso('2099-12-31')).toBe(
      new Date(2099, 11, 31, 23, 59, 59).toISOString(),
    );
  });
});
