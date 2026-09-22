import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { dosDateTime } from './zip';

/** The packed fields, unpacked the way an unzip tool reads them. */
function decode({ time, date }: { time: number; date: number }) {
  return {
    year: 1980 + (date >> 9),
    month: (date >> 5) & 0x0f,
    day: date & 0x1f,
    hours: time >> 11,
    minutes: (time >> 5) & 0x3f,
    seconds: (time & 0x1f) * 2,
  };
}

const anyDate = fc.date({
  min: new Date(1900, 0, 1),
  max: new Date(2200, 11, 31),
  noInvalidDate: true,
});

describe('dosDateTime, for any date', () => {
  it('packs into 16-bit fields that decode to a real DOS date and time', () => {
    fc.assert(
      fc.property(anyDate, (date) => {
        const packed = dosDateTime(date);
        expect(packed.date).toBeGreaterThanOrEqual(0);
        expect(packed.date).toBeLessThan(0x10000);
        expect(packed.time).toBeGreaterThanOrEqual(0);
        expect(packed.time).toBeLessThan(0x10000);

        const d = decode(packed);
        expect(d.year).toBeGreaterThanOrEqual(1980);
        expect(d.year).toBeLessThanOrEqual(2107);
        expect(d.month).toBeGreaterThanOrEqual(1);
        expect(d.month).toBeLessThanOrEqual(12);
        expect(d.day).toBeGreaterThanOrEqual(1);
        expect(d.day).toBeLessThanOrEqual(31);
        expect(d.hours).toBeLessThanOrEqual(23);
        expect(d.minutes).toBeLessThanOrEqual(59);
        expect(d.seconds).toBeLessThanOrEqual(58);
      }),
    );
  });

  it('keeps every field of a date the format can hold, to two seconds', () => {
    const representable = fc.date({
      min: new Date(1980, 0, 1),
      max: new Date(2107, 11, 31, 23, 59, 59),
      noInvalidDate: true,
    });
    fc.assert(
      fc.property(representable, (date) => {
        expect(decode(dosDateTime(date))).toEqual({
          year: date.getFullYear(),
          month: date.getMonth() + 1,
          day: date.getDate(),
          hours: date.getHours(),
          minutes: date.getMinutes(),
          seconds: date.getSeconds() - (date.getSeconds() % 2),
        });
      }),
    );
  });

  it('clamps a date the format cannot hold to the 1980 epoch instead of wrapping', () => {
    const outside = fc.oneof(
      fc.date({
        min: new Date(1900, 0, 1),
        max: new Date(1979, 11, 31, 23, 59, 59),
        noInvalidDate: true,
      }),
      fc.date({
        min: new Date(2108, 0, 1),
        max: new Date(2200, 11, 31),
        noInvalidDate: true,
      }),
    );
    fc.assert(
      fc.property(outside, (date) => {
        expect(decode(dosDateTime(date))).toEqual({
          year: 1980,
          month: 1,
          day: 1,
          hours: 0,
          minutes: 0,
          seconds: 0,
        });
      }),
    );
  });
});
