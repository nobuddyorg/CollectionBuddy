import { describe, expect, it, vi } from 'vitest';

import {
  assertZipRoom,
  createZipWriter,
  crc32,
  dosDateTime,
  MAX_ZIP_BYTES,
  MAX_ZIP_ENTRIES,
  ZipLimitError,
} from './zip';

const encoder = new TextEncoder();

async function bytesOf(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await blob.arrayBuffer());
}

function u32(bytes: Uint8Array, at: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(at, true);
}

function u16(bytes: Uint8Array, at: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint16(at, true);
}

describe('createZipWriter', () => {
  const modified = new Date(2026, 7, 6, 13, 45, 30);

  it('lays entries out header-then-bytes, in the order they were added', async () => {
    const writer = createZipWriter();
    writer.add({ path: 'one.txt', bytes: encoder.encode('hello'), modified });
    writer.add({ path: 'two.txt', bytes: encoder.encode('!'), modified });
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
    const directoryAt = u32(bytes, trailerAt + 16);
    const firstRecord = directoryAt;
    const secondRecord = firstRecord + 46 + 'one.txt'.length;
    expect(u32(bytes, firstRecord + 42)).toBe(0);
    expect(u32(bytes, secondRecord + 42)).toBe(secondOffset);
    // Every offset the directory gives has to land on a local header.
    expect(u32(bytes, u32(bytes, secondRecord + 42))).toBe(0x04034b50);
  });

  it('ends with a trailer describing the directory it just wrote', async () => {
    const writer = createZipWriter();
    writer.add({ path: 'one.txt', bytes: encoder.encode('hello'), modified });
    writer.add({ path: 'two.txt', bytes: encoder.encode('!'), modified });
    const bytes = await bytesOf(writer.finish());

    const trailerAt = bytes.length - 22;
    expect(u32(bytes, trailerAt)).toBe(0x06054b50);
    expect(u16(bytes, trailerAt + 8)).toBe(2);
    expect(u16(bytes, trailerAt + 10)).toBe(2);
    const directorySize = 46 + 7 + 46 + 7;
    expect(u32(bytes, trailerAt + 12)).toBe(directorySize);
    expect(u32(bytes, trailerAt + 16)).toBe(trailerAt - directorySize);
    expect(u32(bytes, u32(bytes, trailerAt + 16))).toBe(0x02014b50);
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
    writer.add({ path: 'f.txt', bytes: payload, modified });
    const bytes = await bytesOf(writer.finish());
    expect(u32(bytes, 14)).toBe(crc32(payload));
    const at = 30 + 'f.txt'.length;
    expect(bytes.slice(at, at + payload.length)).toEqual(payload);
  });

  it('carries the modification time given to add, not the time of the run', async () => {
    const writer = createZipWriter();
    writer.add({ path: 'f.txt', bytes: encoder.encode('x'), modified });
    const bytes = await bytesOf(writer.finish());
    const { time, date } = dosDateTime(modified);
    expect(u16(bytes, 10)).toBe(time);
    expect(u16(bytes, 12)).toBe(date);
  });

  // Pinned clock, so the writer's own `new Date()` and the assertion cannot straddle midnight.
  it('defaults the modification time to now when none is given', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 15, 23, 59, 59));
    try {
      const writer = createZipWriter();
      writer.add({ path: 'f.txt', bytes: encoder.encode('x') });
      const bytes = await bytesOf(writer.finish());
      expect(u16(bytes, 12)).toBe(dosDateTime(new Date()).date);
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
