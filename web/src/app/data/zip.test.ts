import { describe, expect, it, vi } from 'vitest';

import {
  assertZipRoom,
  centralDirectoryEntry,
  createZipWriter,
  crc32,
  crc32Table,
  dosDateTime,
  encodePath,
  endOfCentralDirectory,
  localFileHeader,
  MAX_ZIP_BYTES,
  MAX_ZIP_ENTRIES,
  ZipLimitError,
  type ZipEntry,
} from './zip';

const encoder = new TextEncoder();

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

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function u32(bytes: Uint8Array, at: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(at, true);
}

function u16(bytes: Uint8Array, at: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint16(at, true);
}

describe('crc32', () => {
  // The canonical check value from the CRC-32 specification. If the table
  // or the loop is wrong in any way, this is the value that moves.
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

  it('keeps 1980 itself, which is the epoch and not before it', () => {
    // A clamp that fired one year late would be invisible on 1980-01-01,
    // since that is also what it clamps to -- so this asks mid-year.
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
    expect(u32(bytes, 0)).toBe(0x04034b50);
    expect(u16(bytes, 4)).toBe(20);
    // Bit 11 set: the name that follows is UTF-8.
    expect(u16(bytes, 6)).toBe(0x0800);
    // Method 0 -- stored. A deflate marker here would make every archive
    // this writes unreadable, since it never compresses anything.
    expect(u16(bytes, 8)).toBe(0);
    expect(u16(bytes, 10)).toBe(0x4a2b);
    expect(u16(bytes, 12)).toBe(0x5cc6);
    expect(u32(bytes, 14)).toBe(0x12345678);
    // Stored, so both size fields carry the same number.
    expect(u32(bytes, 18)).toBe(7);
    expect(u32(bytes, 22)).toBe(7);
    expect(u16(bytes, 26)).toBe(2);
    expect(u16(bytes, 28)).toBe(0);
    expect(bytes).toHaveLength(32);
    expect(new TextDecoder().decode(bytes.slice(30))).toBe('ab');
  });

  it('sizes the header by the name’s bytes, not its characters', () => {
    expect(localFileHeader(entry({ path: 'ü' }))).toHaveLength(32);
    expect(u16(localFileHeader(entry({ path: 'ü' })), 26)).toBe(2);
  });
});

describe('centralDirectoryEntry', () => {
  it('writes the signature, the offset and the name', () => {
    const bytes = centralDirectoryEntry(
      entry({ path: 'a/b.webp', size: 9, offset: 1234 }),
    );
    expect(u32(bytes, 0)).toBe(0x02014b50);
    expect(u16(bytes, 4)).toBe(20);
    expect(u16(bytes, 6)).toBe(20);
    expect(u16(bytes, 8)).toBe(0x0800);
    expect(u16(bytes, 10)).toBe(0);
    expect(u16(bytes, 12)).toBe(0x4a2b);
    expect(u16(bytes, 14)).toBe(0x5cc6);
    expect(u32(bytes, 16)).toBe(0x12345678);
    expect(u32(bytes, 20)).toBe(9);
    expect(u32(bytes, 24)).toBe(9);
    expect(u16(bytes, 28)).toBe(8);
    // Extra, comment, disk, attributes: all zero.
    expect(u16(bytes, 30)).toBe(0);
    expect(u16(bytes, 32)).toBe(0);
    expect(u16(bytes, 34)).toBe(0);
    expect(u16(bytes, 36)).toBe(0);
    expect(u32(bytes, 38)).toBe(0);
    // The offset is what an extractor seeks to; a wrong one reads garbage.
    expect(u32(bytes, 42)).toBe(1234);
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
    expect(u32(bytes, 0)).toBe(0x06054b50);
    expect(u16(bytes, 4)).toBe(0);
    expect(u16(bytes, 6)).toBe(0);
    // On this disk, and in total -- the same number, single-disk archive.
    expect(u16(bytes, 8)).toBe(3);
    expect(u16(bytes, 10)).toBe(3);
    expect(u32(bytes, 12)).toBe(150);
    expect(u32(bytes, 16)).toBe(900);
    expect(u16(bytes, 20)).toBe(0);
  });
});

describe('createZipWriter', () => {
  const modified = new Date(2026, 7, 6, 13, 45, 30);

  it('lays entries out header-then-bytes, in the order they were added', async () => {
    const writer = createZipWriter();
    writer.add('one.txt', encoder.encode('hello'), modified);
    writer.add('two.txt', encoder.encode('!'), modified);
    const bytes = await bytesOf(writer.finish());

    expect(u32(bytes, 0)).toBe(0x04034b50);
    const firstName = 'one.txt'.length;
    expect(new TextDecoder().decode(bytes.slice(30, 30 + firstName))).toBe(
      'one.txt',
    );
    const firstData = 30 + firstName;
    expect(
      new TextDecoder().decode(bytes.slice(firstData, firstData + 5)),
    ).toBe('hello');
    // The second entry's local header starts immediately after the first.
    expect(u32(bytes, firstData + 5)).toBe(0x04034b50);
  });

  it('reports the running size, which is where the next entry begins', () => {
    const writer = createZipWriter();
    expect(writer.size()).toBe(0);
    writer.add('one.txt', encoder.encode('hello'), modified);
    expect(writer.size()).toBe(30 + 'one.txt'.length + 5);
    writer.add('two.txt', encoder.encode('!'), modified);
    expect(writer.size()).toBe(30 + 7 + 5 + 30 + 7 + 1);
  });

  it('records each entry’s offset so the directory points at its header', async () => {
    const writer = createZipWriter();
    writer.add('one.txt', encoder.encode('hello'), modified);
    const secondOffset = writer.size();
    writer.add('two.txt', encoder.encode('!'), modified);
    const bytes = await bytesOf(writer.finish());

    const eocd = bytes.length - 22;
    const directoryAt = u32(bytes, eocd + 16);
    const firstRecord = directoryAt;
    const secondRecord = firstRecord + 46 + 'one.txt'.length;
    expect(u32(bytes, firstRecord + 42)).toBe(0);
    expect(u32(bytes, secondRecord + 42)).toBe(secondOffset);
    // Every offset the directory gives has to land on a local header.
    expect(u32(bytes, u32(bytes, secondRecord + 42))).toBe(0x04034b50);
  });

  it('ends with a trailer describing the directory it just wrote', async () => {
    const writer = createZipWriter();
    writer.add('one.txt', encoder.encode('hello'), modified);
    writer.add('two.txt', encoder.encode('!'), modified);
    const bytes = await bytesOf(writer.finish());

    const eocd = bytes.length - 22;
    expect(u32(bytes, eocd)).toBe(0x06054b50);
    expect(u16(bytes, eocd + 8)).toBe(2);
    expect(u16(bytes, eocd + 10)).toBe(2);
    const directorySize = 46 + 7 + 46 + 7;
    expect(u32(bytes, eocd + 12)).toBe(directorySize);
    expect(u32(bytes, eocd + 16)).toBe(eocd - directorySize);
    expect(u32(bytes, u32(bytes, eocd + 16))).toBe(0x02014b50);
  });

  it('writes a valid empty archive', async () => {
    const bytes = await bytesOf(createZipWriter().finish());
    expect(bytes).toHaveLength(22);
    expect(u32(bytes, 0)).toBe(0x06054b50);
    expect(u16(bytes, 8)).toBe(0);
    expect(u32(bytes, 12)).toBe(0);
    expect(u32(bytes, 16)).toBe(0);
  });

  it('stores the bytes verbatim, so the CRC in the header matches them', async () => {
    const payload = encoder.encode('the quick brown fox');
    const writer = createZipWriter();
    writer.add('f.txt', payload, modified);
    const bytes = await bytesOf(writer.finish());
    expect(u32(bytes, 14)).toBe(crc32(payload));
    const at = 30 + 'f.txt'.length;
    expect(bytes.slice(at, at + payload.length)).toEqual(payload);
  });

  it('carries the modification time given to add, not the time of the run', async () => {
    const writer = createZipWriter();
    writer.add('f.txt', encoder.encode('x'), modified);
    const bytes = await bytesOf(writer.finish());
    const { time, date } = dosDateTime(modified);
    expect(u16(bytes, 10)).toBe(time);
    expect(u16(bytes, 12)).toBe(date);
  });

  // A real `new Date()` here (there being no `modified` to fake it with)
  // used to be called twice -- once inside the writer, once in the
  // assertion -- which fails the one run in a thousand where the local
  // clock ticks past midnight between the two. A pinned clock makes both
  // calls see the same instant regardless of when the suite happens to run.
  it('defaults the modification time to now when none is given', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 23, 59, 59));
    try {
      const writer = createZipWriter();
      writer.add('f.txt', encoder.encode('x'));
      const bytes = await bytesOf(writer.finish());
      expect(u16(bytes, 12)).toBe(dosDateTime(new Date()).date);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps directory paths as they were given', async () => {
    const writer = createZipWriter();
    const path = 'photos/001-coin/1.webp';
    writer.add(path, encoder.encode('x'), modified);
    const bytes = await bytesOf(writer.finish());
    expect(new TextDecoder().decode(bytes.slice(30, 30 + path.length))).toBe(
      path,
    );
  });

  it('refuses an entry that would push the archive past what 32 bits describe', () => {
    const writer = createZipWriter();
    // A length is all the writer reads before it decides, so a stand-in of
    // the right length saves allocating four gigabytes to prove it.
    const huge = {
      length: MAX_ZIP_BYTES,
    } as unknown as Uint8Array<ArrayBuffer>;
    expect(() => writer.add('big.bin', huge, modified)).toThrow(ZipLimitError);
  });
});

describe('assertZipRoom', () => {
  it('allows an archive exactly at each limit', () => {
    expect(() => assertZipRoom(MAX_ZIP_BYTES, MAX_ZIP_ENTRIES)).not.toThrow();
  });

  it('rejects one byte past the size limit', () => {
    expect(() => assertZipRoom(MAX_ZIP_BYTES + 1, 0)).toThrow(ZipLimitError);
    expect(() => assertZipRoom(MAX_ZIP_BYTES + 1, 0)).toThrow(/4 GiB/);
  });

  it('rejects one entry past what the trailer’s 16-bit count can hold', () => {
    expect(() => assertZipRoom(0, MAX_ZIP_ENTRIES + 1)).toThrow(ZipLimitError);
    expect(() => assertZipRoom(0, MAX_ZIP_ENTRIES + 1)).toThrow(/65535/);
  });

  it('states the limits the headers actually impose', () => {
    expect(MAX_ZIP_BYTES).toBe(0xffffffff);
    expect(MAX_ZIP_ENTRIES).toBe(0xffff);
  });

  it('names its errors, so a caller can tell them from an I/O failure', () => {
    expect(new ZipLimitError('x').name).toBe('ZipLimitError');
    expect(new ZipLimitError('x')).toBeInstanceOf(Error);
  });
});
