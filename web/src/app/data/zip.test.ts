import { describe, expect, it } from 'vitest';

import {
  centralDirectoryEntry,
  crc32,
  crc32Table,
  dosDateTime,
  encodePath,
  endOfCentralDirectory,
  localFileHeader,
  type ZipEntry,
} from './zip';
import { encoder, uint32, uint16 } from './zip.test-support';

function entry(overrides: Partial<ZipEntry> = {}): ZipEntry {
  return {
    path: 'a.txt',
    crc: 0x12345678,
    size: 5,
    offset: 0,
    time: 0x4a2b,
    date: 0x5cc6,
    ...overrides,
  };
}

describe('crc32', () => {
  // The canonical check value from the CRC-32 specification.
  it('produces the standard check value for "123456789"', () => {
    expect(crc32(encoder.encode('123456789'))).toBe(0xcbf43926);
  });

  it('is 0 for no bytes at all', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });

  it('known vectors', () => {
    expect(crc32(encoder.encode('a'))).toBe(0xe8b7be43);
    expect(crc32(encoder.encode('hello'))).toBe(0x3610a686);
  });

  it('is order-sensitive', () => {
    expect(crc32(new Uint8Array([1, 2]))).not.toBe(
      crc32(new Uint8Array([2, 1])),
    );
  });

  it('stays unsigned for input whose CRC has the high bit set', () => {
    expect(crc32(encoder.encode('a'))).toBeGreaterThan(0x7fffffff);
  });

  it('builds the table once and reuses it', () => {
    expect(crc32Table()).toBe(crc32Table());
    expect(crc32Table()).toHaveLength(256);
    // The first and last entries of the standard IEEE table.
    expect(crc32Table()[0]).toBe(0);
    expect(crc32Table()[1]).toBe(0x77073096);
    expect(crc32Table()[255]).toBe(0x2d02ef8d);
  });
});

describe('dosDateTime', () => {
  it('packs a date into the MS-DOS fields', () => {
    // 2026-08-06 13:45:30
    const { time, date } = dosDateTime(new Date(2026, 7, 6, 13, 45, 30));
    expect(date).toBe(((2026 - 1980) << 9) | (8 << 5) | 6);
    expect(time).toBe((13 << 11) | (45 << 5) | 15);
  });

  it('rounds seconds down to the format’s two-second resolution', () => {
    const odd = dosDateTime(new Date(2026, 0, 1, 0, 0, 31));
    const even = dosDateTime(new Date(2026, 0, 1, 0, 0, 30));
    expect(odd.time).toBe(even.time);
    expect(odd.time & 0x1f).toBe(15);
  });

  it('clamps a date before the 1980 epoch rather than wrapping it', () => {
    expect(dosDateTime(new Date(1979, 11, 31, 23, 59, 59))).toEqual({
      time: 0,
      date: (1 << 5) | 1,
    });
  });

  // Mid-year, since a clamp firing one year late would be invisible on 1980-01-01 itself.
  it('keeps 1980 itself, which is the epoch and not before it', () => {
    expect(dosDateTime(new Date(1980, 5, 15, 10, 0, 0))).toEqual({
      time: 10 << 11,
      date: (6 << 5) | 15,
    });
  });

  it('clamps a date past what the 7-bit year field can hold', () => {
    expect(dosDateTime(new Date(2108, 0, 1))).toEqual({
      time: 0,
      date: (1 << 5) | 1,
    });
  });

  it('keeps the last year that does fit', () => {
    expect(dosDateTime(new Date(2107, 0, 1)).date).toBe(
      ((2107 - 1980) << 9) | (1 << 5) | 1,
    );
  });
});

describe('encodePath', () => {
  it('encodes as UTF-8, so a name is measured in bytes not characters', () => {
    expect(encodePath('münze')).toHaveLength(6);
    expect(Array.from(encodePath('a'))).toEqual([0x61]);
  });
});

describe('localFileHeader', () => {
  it('writes the signature, sizes and name', () => {
    const bytes = localFileHeader(entry({ path: 'ab', size: 7 }));
    expect(uint32(bytes, 0)).toBe(0x04034b50);
    expect(uint16(bytes, 4)).toBe(20);
    // Bit 11 set: the name that follows is UTF-8.
    expect(uint16(bytes, 6)).toBe(0x0800);
    // Method 0, stored: a deflate marker would make every archive unreadable.
    expect(uint16(bytes, 8)).toBe(0);
    expect(uint16(bytes, 10)).toBe(0x4a2b);
    expect(uint16(bytes, 12)).toBe(0x5cc6);
    expect(uint32(bytes, 14)).toBe(0x12345678);
    // Stored, so both size fields carry the same number.
    expect(uint32(bytes, 18)).toBe(7);
    expect(uint32(bytes, 22)).toBe(7);
    expect(uint16(bytes, 26)).toBe(2);
    expect(uint16(bytes, 28)).toBe(0);
    expect(bytes).toHaveLength(32);
    expect(new TextDecoder().decode(bytes.slice(30))).toBe('ab');
  });

  it('sizes the header by the name’s bytes, not its characters', () => {
    expect(localFileHeader(entry({ path: 'ü' }))).toHaveLength(32);
    expect(uint16(localFileHeader(entry({ path: 'ü' })), 26)).toBe(2);
  });
});

describe('centralDirectoryEntry', () => {
  it('writes the signature, the offset and the name', () => {
    const bytes = centralDirectoryEntry(
      entry({ path: 'a/b.webp', size: 9, offset: 1234 }),
    );
    expect(uint32(bytes, 0)).toBe(0x02014b50);
    expect(uint16(bytes, 4)).toBe(20);
    expect(uint16(bytes, 6)).toBe(20);
    expect(uint16(bytes, 8)).toBe(0x0800);
    expect(uint16(bytes, 10)).toBe(0);
    expect(uint16(bytes, 12)).toBe(0x4a2b);
    expect(uint16(bytes, 14)).toBe(0x5cc6);
    expect(uint32(bytes, 16)).toBe(0x12345678);
    expect(uint32(bytes, 20)).toBe(9);
    expect(uint32(bytes, 24)).toBe(9);
    expect(uint16(bytes, 28)).toBe(8);
    // Extra, comment, disk, attributes: all zero.
    expect(uint16(bytes, 30)).toBe(0);
    expect(uint16(bytes, 32)).toBe(0);
    expect(uint16(bytes, 34)).toBe(0);
    expect(uint16(bytes, 36)).toBe(0);
    expect(uint32(bytes, 38)).toBe(0);
    // The offset is what an extractor seeks to; a wrong one reads garbage.
    expect(uint32(bytes, 42)).toBe(1234);
    expect(new TextDecoder().decode(bytes.slice(46))).toBe('a/b.webp');
  });
});

describe('endOfCentralDirectory', () => {
  it('states the entry count twice and locates the directory', () => {
    const bytes = endOfCentralDirectory({
      entries: 3,
      size: 150,
      offset: 900,
    });
    expect(bytes).toHaveLength(22);
    expect(uint32(bytes, 0)).toBe(0x06054b50);
    expect(uint16(bytes, 4)).toBe(0);
    expect(uint16(bytes, 6)).toBe(0);
    // On this disk, and in total -- the same number, single-disk archive.
    expect(uint16(bytes, 8)).toBe(3);
    expect(uint16(bytes, 10)).toBe(3);
    expect(uint32(bytes, 12)).toBe(150);
    expect(uint32(bytes, 16)).toBe(900);
    expect(uint16(bytes, 20)).toBe(0);
  });
});
