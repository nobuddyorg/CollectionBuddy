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
  openZip,
  ZipLimitError,
  ZipReadError,
  type ZipEntry,
} from './zip';

const encoder = new TextEncoder();

async function bytesOf(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await blob.arrayBuffer());
}

function uint32(bytes: Uint8Array, at: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(at, true);
}

function uint16(bytes: Uint8Array, at: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint16(at, true);
}

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

async function oneEntryArchive(): Promise<Uint8Array<ArrayBuffer>> {
  const writer = createZipWriter();
  writer.add({ path: 'a.txt', bytes: new Uint8Array([1, 2, 3]) });
  return bytesOf(writer.finish());
}

function dataViewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
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

describe('createZipWriter', () => {
  const modified = new Date(2026, 7, 6, 13, 45, 30);

  it('lays entries out header-then-bytes, in the order they were added', async () => {
    const writer = createZipWriter();
    writer.add({ path: 'one.txt', bytes: encoder.encode('hello'), modified });
    writer.add({ path: 'two.txt', bytes: encoder.encode('!'), modified });
    const bytes = await bytesOf(writer.finish());

    expect(uint32(bytes, 0)).toBe(0x04034b50);
    const firstName = 'one.txt'.length;
    expect(new TextDecoder().decode(bytes.slice(30, 30 + firstName))).toBe(
      'one.txt',
    );
    const firstData = 30 + firstName;
    expect(
      new TextDecoder().decode(bytes.slice(firstData, firstData + 5)),
    ).toBe('hello');
    // The second entry's local header starts immediately after the first.
    expect(uint32(bytes, firstData + 5)).toBe(0x04034b50);
  });

  it('reports the running size, which is where the next entry begins', () => {
    const writer = createZipWriter();
    expect(writer.size()).toBe(0);
    writer.add({ path: 'one.txt', bytes: encoder.encode('hello'), modified });
    expect(writer.size()).toBe(30 + 'one.txt'.length + 5);
    writer.add({ path: 'two.txt', bytes: encoder.encode('!'), modified });
    expect(writer.size()).toBe(30 + 7 + 5 + 30 + 7 + 1);
  });

  it('records each entry’s offset so the directory points at its header', async () => {
    const writer = createZipWriter();
    writer.add({ path: 'one.txt', bytes: encoder.encode('hello'), modified });
    const secondOffset = writer.size();
    writer.add({ path: 'two.txt', bytes: encoder.encode('!'), modified });
    const bytes = await bytesOf(writer.finish());

    const trailerAt = bytes.length - 22;
    const directoryAt = uint32(bytes, trailerAt + 16);
    const firstRecord = directoryAt;
    const secondRecord = firstRecord + 46 + 'one.txt'.length;
    expect(uint32(bytes, firstRecord + 42)).toBe(0);
    expect(uint32(bytes, secondRecord + 42)).toBe(secondOffset);
    // Every offset the directory gives has to land on a local header.
    expect(uint32(bytes, uint32(bytes, secondRecord + 42))).toBe(0x04034b50);
  });

  it('ends with a trailer describing the directory it just wrote', async () => {
    const writer = createZipWriter();
    writer.add({ path: 'one.txt', bytes: encoder.encode('hello'), modified });
    writer.add({ path: 'two.txt', bytes: encoder.encode('!'), modified });
    const bytes = await bytesOf(writer.finish());

    const trailerAt = bytes.length - 22;
    expect(uint32(bytes, trailerAt)).toBe(0x06054b50);
    expect(uint16(bytes, trailerAt + 8)).toBe(2);
    expect(uint16(bytes, trailerAt + 10)).toBe(2);
    const directorySize = 46 + 7 + 46 + 7;
    expect(uint32(bytes, trailerAt + 12)).toBe(directorySize);
    expect(uint32(bytes, trailerAt + 16)).toBe(trailerAt - directorySize);
    expect(uint32(bytes, uint32(bytes, trailerAt + 16))).toBe(0x02014b50);
  });

  it('writes a valid empty archive', async () => {
    const bytes = await bytesOf(createZipWriter().finish());
    expect(bytes).toHaveLength(22);
    expect(uint32(bytes, 0)).toBe(0x06054b50);
    expect(uint16(bytes, 8)).toBe(0);
    expect(uint32(bytes, 12)).toBe(0);
    expect(uint32(bytes, 16)).toBe(0);
  });

  it('stores the bytes verbatim, so the CRC in the header matches them', async () => {
    const payload = encoder.encode('the quick brown fox');
    const writer = createZipWriter();
    writer.add({ path: 'f.txt', bytes: payload, modified });
    const bytes = await bytesOf(writer.finish());
    expect(uint32(bytes, 14)).toBe(crc32(payload));
    const at = 30 + 'f.txt'.length;
    expect(bytes.slice(at, at + payload.length)).toEqual(payload);
  });

  it('carries the modification time given to add, not the time of the run', async () => {
    const writer = createZipWriter();
    writer.add({ path: 'f.txt', bytes: encoder.encode('x'), modified });
    const bytes = await bytesOf(writer.finish());
    const { time, date } = dosDateTime(modified);
    expect(uint16(bytes, 10)).toBe(time);
    expect(uint16(bytes, 12)).toBe(date);
  });

  // Pinned clock, so the writer's own `new Date()` and the assertion cannot straddle midnight.
  it('defaults the modification time to now when none is given', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 23, 59, 59));
    try {
      const writer = createZipWriter();
      writer.add({ path: 'f.txt', bytes: encoder.encode('x') });
      const bytes = await bytesOf(writer.finish());
      expect(uint16(bytes, 12)).toBe(dosDateTime(new Date()).date);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps directory paths as they were given', async () => {
    const writer = createZipWriter();
    const path = 'photos/001-coin/1.webp';
    writer.add({ path, bytes: encoder.encode('x'), modified });
    const bytes = await bytesOf(writer.finish());
    expect(new TextDecoder().decode(bytes.slice(30, 30 + path.length))).toBe(
      path,
    );
  });

  it('refuses an entry that would push the archive past what 32 bits describe', () => {
    const writer = createZipWriter();
    // Only the length is read before the refusal, so a stand-in avoids allocating four gigabytes.
    const huge = {
      length: MAX_ZIP_BYTES,
    } as unknown as Uint8Array<ArrayBuffer>;
    expect(() =>
      writer.add({ path: 'big.bin', bytes: huge, modified }),
    ).toThrow(ZipLimitError);
  });

  // A removed byte guard would fall through to crc32 over the huge stand-in until Stryker's timeout.
  it('refuses an entry through the writer once a lowered byte limit is reached', () => {
    const writer = createZipWriter({ maxBytes: 39 });
    expect(() =>
      writer.add({ path: 'a.txt', bytes: encoder.encode('hello') }),
    ).toThrow(ZipLimitError);
  });

  it('refuses an entry through the writer once a lowered entry-count limit is reached', () => {
    const writer = createZipWriter({ maxEntries: 1 });
    writer.add({ path: 'a.txt', bytes: encoder.encode('x'), modified });
    expect(() =>
      writer.add({ path: 'b.txt', bytes: encoder.encode('y'), modified }),
    ).toThrow(ZipLimitError);
  });

  // Every add() fits on its own; only the directory and trailer finish() appends push it over.
  it('refuses at finish() when the directory and trailer push the total past a lowered byte limit', () => {
    const writer = createZipWriter({ maxBytes: 100 });
    writer.add({ path: 'a.txt', bytes: encoder.encode('x'), modified });
    expect(() => writer.finish()).toThrow(ZipLimitError);
  });
});

describe('assertZipRoom', () => {
  it('allows an archive exactly at each limit', () => {
    expect(() =>
      assertZipRoom({ totalBytes: MAX_ZIP_BYTES, entryCount: MAX_ZIP_ENTRIES }),
    ).not.toThrow();
  });

  it('rejects one byte past the size limit', () => {
    expect(() =>
      assertZipRoom({ totalBytes: MAX_ZIP_BYTES + 1, entryCount: 0 }),
    ).toThrow(ZipLimitError);
    expect(() =>
      assertZipRoom({ totalBytes: MAX_ZIP_BYTES + 1, entryCount: 0 }),
    ).toThrow(/4 GiB/);
  });

  it('rejects one entry past what the trailer’s 16-bit count can hold', () => {
    expect(() =>
      assertZipRoom({ totalBytes: 0, entryCount: MAX_ZIP_ENTRIES + 1 }),
    ).toThrow(ZipLimitError);
    expect(() =>
      assertZipRoom({ totalBytes: 0, entryCount: MAX_ZIP_ENTRIES + 1 }),
    ).toThrow(/65535/);
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

// Every entry's bytes, read the way the import reads one photograph at a time.
async function readAll(archive: Blob): Promise<Map<string, Uint8Array>> {
  const entries = new Map<string, Uint8Array>();
  for (const [path, read] of await openZip(archive)) {
    entries.set(path, await bytesOf(await read()));
  }
  return entries;
}

// The one entry's directory record, which directly precedes the trailer.
function directoryRecordAt(bytes: Uint8Array): number {
  return bytes.length - 22 - (46 + 'a.txt'.length);
}

// Every archive read back here was produced by createZipWriter, so a round trip proves they agree.
describe('openZip', () => {
  it('reads back every entry a writer produced, byte for byte', async () => {
    const writer = createZipWriter();
    writer.add({ path: 'collection.json', bytes: encoder.encode('{"a":1}') });
    writer.add({
      path: 'photos/1.webp',
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
    });
    const entries = await readAll(writer.finish());

    expect(entries.size).toBe(2);
    expect(new TextDecoder().decode(entries.get('collection.json'))).toBe(
      '{"a":1}',
    );
    expect(entries.get('photos/1.webp')).toEqual(
      new Uint8Array([1, 2, 3, 4, 5]),
    );
  });

  // #755: a photograph's bytes stay in the file until its upload asks for them.
  it('opens an archive by its directory alone, loading no entry until it is read', async () => {
    const writer = createZipWriter();
    const photo = new Uint8Array(100_000).fill(7);
    writer.add({ path: 'p.webp', bytes: photo });
    const archive = writer.finish();
    const photoEnds = 30 + 'p.webp'.length + photo.length;
    const sliced: number[] = [];
    const watched = {
      size: archive.size,
      slice: (start: number, end: number) => {
        sliced.push(start);
        return archive.slice(start, end);
      },
    } as Blob;

    const entries = await openZip(watched);

    expect(sliced.length).toBeGreaterThan(0);
    expect(sliced.every((start) => start >= photoEnds)).toBe(true);
    const read = await entries.get('p.webp')!();
    expect(read.size).toBe(photo.length);
    expect(await bytesOf(read)).toEqual(photo);
  });

  it('reads an empty archive as an empty map, not an error', async () => {
    const entries = await openZip(createZipWriter().finish());
    expect(entries.size).toBe(0);
  });

  it('keeps entries with the same name apart by path, not by basename', async () => {
    const writer = createZipWriter();
    writer.add({ path: 'a/1.webp', bytes: new Uint8Array([1]) });
    writer.add({ path: 'b/1.webp', bytes: new Uint8Array([2]) });
    const entries = await readAll(writer.finish());

    expect(entries.get('a/1.webp')).toEqual(new Uint8Array([1]));
    expect(entries.get('b/1.webp')).toEqual(new Uint8Array([2]));
  });

  it('rejects a file too small to hold even the end-of-central-directory record', async () => {
    await expect(openZip(new Blob([new Uint8Array(10)]))).rejects.toThrow(
      /file is too small/,
    );
  });

  // Both bounds are `>`, not `>=`: a structure ending on the file's last byte is inside the file.
  it('reads an entry whose data ends on the very last byte', async () => {
    const bytes = await oneEntryArchive();
    const dataStart = 30 + 'a.txt'.length;
    dataViewOf(bytes).setUint32(
      directoryRecordAt(bytes) + 24,
      bytes.length - dataStart,
      true,
    );

    const entries = await readAll(new Blob([bytes]));

    expect(entries.get('a.txt')).toHaveLength(bytes.length - dataStart);
  });

  it('reads a directory pointer that leaves exactly one header of room', async () => {
    const bytes = await oneEntryArchive();
    const dataView = dataViewOf(bytes);
    // Not past the end, so the bound lets it through; the signature found there is what rejects it.
    dataView.setUint32(bytes.length - 22 + 16, bytes.length - 46, true);

    await expect(openZip(new Blob([bytes]))).rejects.toThrow(
      /malformed central directory entry/,
    );
  });

  it('rejects a file with no end-of-central-directory signature at all', async () => {
    const junk = new Uint8Array(30);
    await expect(openZip(new Blob([junk]))).rejects.toThrow(
      /end-of-central-directory/,
    );
  });

  // Opening reads no entry, so a bad size surfaces when that one entry is read.
  it('rejects reading an entry whose size runs past the file', async () => {
    const bytes = await oneEntryArchive();
    dataViewOf(bytes).setUint32(directoryRecordAt(bytes) + 24, 0xffffff, true);
    const entries = await openZip(new Blob([bytes]));

    const failure = entries.get('a.txt')!();
    await expect(failure).rejects.toBeInstanceOf(ZipReadError);
    await expect(failure).rejects.toThrow('"a.txt" runs past the file');
  });

  it('rejects reading an entry whose local header lies past the file', async () => {
    const bytes = await oneEntryArchive();
    dataViewOf(bytes).setUint32(
      directoryRecordAt(bytes) + 42,
      // Short of the name-length field, which a read past the file's end would otherwise fail on as a RangeError.
      bytes.length - 27,
      true,
    );
    const entries = await openZip(new Blob([bytes]));

    const failure = entries.get('a.txt')!();
    await expect(failure).rejects.toBeInstanceOf(ZipReadError);
    await expect(failure).rejects.toThrow('"a.txt" runs past the file');
  });

  it('rejects when the end-of-central-directory record claims more entries than the file actually holds', async () => {
    const bytes = await oneEntryArchive();
    const dataView = dataViewOf(bytes);
    const trailerAt = bytes.length - 22;
    // Both entry-count fields say 2 for one real entry, so the second directory pointer overruns.
    dataView.setUint16(trailerAt + 8, 2, true);
    dataView.setUint16(trailerAt + 10, 2, true);
    await expect(openZip(new Blob([bytes]))).rejects.toThrow(
      /central directory runs past the file/,
    );
  });

  it('rejects a central directory entry with the wrong signature', async () => {
    const bytes = await oneEntryArchive();
    dataViewOf(bytes).setUint32(directoryRecordAt(bytes), 0xdeadbeef, true);
    await expect(openZip(new Blob([bytes]))).rejects.toThrow(
      /malformed central directory entry/,
    );
  });

  it('names its errors, so a caller can tell them from any other failure', () => {
    expect(new ZipReadError('x').name).toBe('ZipReadError');
    expect(new ZipReadError('x')).toBeInstanceOf(Error);
  });
});
