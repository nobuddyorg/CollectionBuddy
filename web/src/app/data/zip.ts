/**
 * A minimal ZIP writer, store-only (no deflate).
 *
 * Written by hand rather than pulled in as a dependency for two reasons.
 * The bytes going into the archive are photographs the app has already
 * compressed to WebP, so deflate has nothing left to take out of them --
 * the whole compression half of a zip library would run over every
 * megabyte to produce roughly the same megabyte. And the format's stored
 * variant is a fixed set of little-endian headers around unmodified bytes,
 * which is pure arithmetic: exactly the kind of thing this project already
 * holds to a 100% floor and mutation-tests, and the kind that is far
 * easier to trust from a test than from a changelog.
 *
 * What this deliberately does NOT do is Zip64. That caps an archive at 4
 * GiB and 65535 entries -- see MAX_ZIP_BYTES/MAX_ZIP_ENTRIES below, which
 * the writer enforces rather than silently rolling over into a corrupt
 * file.
 */

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIR_SIGNATURE = 0x06054b50;

const LOCAL_HEADER_BYTES = 30;
const CENTRAL_HEADER_BYTES = 46;
const END_OF_CENTRAL_DIR_BYTES = 22;

/** 2.0: what a stored entry with no extras needs, and nothing beyond it. */
const VERSION = 20;

/** General-purpose bit 11: file names are UTF-8, not the legacy code page. */
const FLAG_UTF8 = 0x0800;

/** Compression method 0 -- the bytes are stored verbatim. */
const METHOD_STORE = 0;

/**
 * The point past which the 32-bit fields in the headers below stop being
 * able to describe the archive. Beyond either of these a writer must move
 * to Zip64, so this one refuses instead of emitting something that would
 * unpack to garbage.
 */
export const MAX_ZIP_BYTES = 0xffffffff;
export const MAX_ZIP_ENTRIES = 0xffff;

const CRC32_POLYNOMIAL = 0xedb88320;

// Built once on first use rather than at module load: a module that is
// imported for its type alone should not spend 256 iterations proving it.
let crcTable: Uint32Array | null = null;

export function crc32Table(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  // Stryker disable next-line EqualityOperator: a typed array silently
  // drops a write past its end, so `<= 256` builds the same 256 entries.
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) {
      c = c & 1 ? CRC32_POLYNOMIAL ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  crcTable = table;
  return table;
}

/** IEEE CRC-32 of `bytes`, as the unsigned value the headers carry. */
export function crc32(bytes: Uint8Array): number {
  const table = crc32Table();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A timestamp in the packed MS-DOS form the headers use: seconds at
 * two-second resolution, and a year counted from 1980.
 *
 * Anything the format cannot express is clamped to 1980-01-01 rather than
 * allowed to wrap -- a date before the epoch would otherwise come out as
 * some arbitrary year in the future.
 */
export function dosDateTime(date: Date): { time: number; date: number } {
  const year = date.getFullYear();
  if (year < 1980 || year > 2107) return { time: 0, date: (1 << 5) | 1 };
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

// Entry names are UTF-8 on the way in (flag bit 11 above says so), and the
// length written into the header is the length in *bytes*, not characters
// -- an umlaut in a category name is two of them.
const encoder = new TextEncoder();

export function encodePath(path: string): Uint8Array<ArrayBuffer> {
  return encoder.encode(path);
}

/** What the writer has to remember about an entry to describe it later. */
export type ZipEntry = {
  path: string;
  crc: number;
  size: number;
  /** Byte offset of this entry's local header from the start of the file. */
  offset: number;
  time: number;
  date: number;
};

function view(length: number): {
  bytes: Uint8Array<ArrayBuffer>;
  dv: DataView;
} {
  const bytes = new Uint8Array(length);
  return { bytes, dv: new DataView(bytes.buffer) };
}

/** The 30-byte header (plus name) that precedes an entry's bytes. */
export function localFileHeader(entry: ZipEntry): Uint8Array<ArrayBuffer> {
  const name = encodePath(entry.path);
  const { bytes, dv } = view(LOCAL_HEADER_BYTES + name.length);
  dv.setUint32(0, LOCAL_HEADER_SIGNATURE, true);
  dv.setUint16(4, VERSION, true);
  dv.setUint16(6, FLAG_UTF8, true);
  // Stryker disable next-line BooleanLiteral: the value is zero, so the
  // byte order this is written in cannot be observed. Stated anyway --
  // "stored" is the one decision this whole writer rests on.
  dv.setUint16(8, METHOD_STORE, true);
  dv.setUint16(10, entry.time, true);
  dv.setUint16(12, entry.date, true);
  dv.setUint32(14, entry.crc, true);
  // Stored, so the compressed and uncompressed sizes are the same number.
  dv.setUint32(18, entry.size, true);
  dv.setUint32(22, entry.size, true);
  dv.setUint16(26, name.length, true);
  // Extra-field length is zero, which the zero-filled buffer already says.
  bytes.set(name, LOCAL_HEADER_BYTES);
  return bytes;
}

/** The 46-byte central-directory record (plus name) for one entry. */
export function centralDirectoryEntry(
  entry: ZipEntry,
): Uint8Array<ArrayBuffer> {
  const name = encodePath(entry.path);
  const { bytes, dv } = view(CENTRAL_HEADER_BYTES + name.length);
  dv.setUint32(0, CENTRAL_HEADER_SIGNATURE, true);
  dv.setUint16(4, VERSION, true);
  dv.setUint16(6, VERSION, true);
  dv.setUint16(8, FLAG_UTF8, true);
  // Stryker disable next-line BooleanLiteral: zero, as in the local header.
  dv.setUint16(10, METHOD_STORE, true);
  dv.setUint16(12, entry.time, true);
  dv.setUint16(14, entry.date, true);
  dv.setUint32(16, entry.crc, true);
  dv.setUint32(20, entry.size, true);
  dv.setUint32(24, entry.size, true);
  dv.setUint16(28, name.length, true);
  // Extra, comment, disk number, internal attributes, external attributes:
  // all zero. The zeroed array already says so; they are named here only
  // because their absence is otherwise indistinguishable from an omission.
  dv.setUint32(42, entry.offset, true);
  bytes.set(name, CENTRAL_HEADER_BYTES);
  return bytes;
}

/** The 22-byte trailer that tells an extractor where the directory is. */
export function endOfCentralDirectory({
  entries,
  size,
  offset,
}: {
  entries: number;
  size: number;
  offset: number;
}): Uint8Array<ArrayBuffer> {
  const { bytes, dv } = view(END_OF_CENTRAL_DIR_BYTES);
  dv.setUint32(0, END_OF_CENTRAL_DIR_SIGNATURE, true);
  // This disk's number, and the disk the directory starts on: both zero in
  // a single-disk archive, and the zero-filled buffer already says so.
  dv.setUint16(8, entries, true);
  dv.setUint16(10, entries, true);
  dv.setUint32(12, size, true);
  dv.setUint32(16, offset, true);
  // Archive comment length: zero, already in the buffer.
  return bytes;
}

export class ZipReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipReadError';
  }
}

/**
 * The counterpart to `createZipWriter`: reads an archive this writer
 * produced back into its entries, keyed by path.
 *
 * Walks the central directory rather than the local headers that precede
 * each entry's bytes -- the central directory is what a real extractor
 * trusts too, and it is the one place every entry's size and offset are
 * recorded without having to sum the local entries first. Store-only, same
 * as the writer: there is no deflate to invert.
 */
export async function readZipEntries(
  blob: Blob,
): Promise<Map<string, Uint8Array<ArrayBuffer>>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length < END_OF_CENTRAL_DIR_BYTES) {
    throw new ZipReadError('Not a ZIP archive: file is too small');
  }
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = bytes.length - END_OF_CENTRAL_DIR_BYTES;
  if (dv.getUint32(eocd, true) !== END_OF_CENTRAL_DIR_SIGNATURE) {
    // A real extractor scans backward for this signature to allow for an
    // archive comment after it; this reader never writes one (`createZipWriter`
    // always leaves the comment length at 0), so requiring it at the very
    // end is exact for anything this app itself produced -- and a clear
    // refusal for anything else, rather than reading garbage as a directory.
    throw new ZipReadError(
      'Not a ZIP archive: no end-of-central-directory record',
    );
  }

  const entryCount = dv.getUint16(eocd + 8, true);
  let directoryAt = dv.getUint32(eocd + 16, true);

  const entries = new Map<string, Uint8Array<ArrayBuffer>>();
  const decoder = new TextDecoder();
  for (let i = 0; i < entryCount; i++) {
    if (directoryAt + CENTRAL_HEADER_BYTES > bytes.length) {
      throw new ZipReadError(
        'Corrupt archive: central directory runs past the file',
      );
    }
    if (dv.getUint32(directoryAt, true) !== CENTRAL_HEADER_SIGNATURE) {
      throw new ZipReadError(
        'Corrupt archive: malformed central directory entry',
      );
    }
    const size = dv.getUint32(directoryAt + 24, true);
    const nameLength = dv.getUint16(directoryAt + 28, true);
    const localOffset = dv.getUint32(directoryAt + 42, true);
    const name = decoder.decode(
      bytes.slice(
        directoryAt + CENTRAL_HEADER_BYTES,
        directoryAt + CENTRAL_HEADER_BYTES + nameLength,
      ),
    );

    const localNameLength = dv.getUint16(localOffset + 26, true);
    const dataStart = localOffset + LOCAL_HEADER_BYTES + localNameLength;
    if (dataStart + size > bytes.length) {
      throw new ZipReadError(`Corrupt archive: "${name}" runs past the file`);
    }
    entries.set(name, bytes.slice(dataStart, dataStart + size));

    directoryAt += CENTRAL_HEADER_BYTES + nameLength;
  }
  return entries;
}

export class ZipLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipLimitError';
  }
}

/**
 * The check that keeps this writer inside what its 32-bit headers can
 * describe. Lifted out of the writer so it can be asserted for the entry
 * cap without actually building 65535 entries to get there.
 *
 * `maxBytes`/`maxEntries` default to the real 32-bit limits; a test can
 * lower them to reach a `createZipWriter` boundary cheaply instead of
 * allocating gigabytes or tens of thousands of entries to prove the same
 * guard (#406).
 */
export function assertZipRoom(
  totalBytes: number,
  entryCount: number,
  maxBytes = MAX_ZIP_BYTES,
  maxEntries = MAX_ZIP_ENTRIES,
): void {
  if (totalBytes > maxBytes) {
    throw new ZipLimitError('Archive would exceed the 4 GiB ZIP limit');
  }
  if (entryCount > maxEntries) {
    throw new ZipLimitError('Archive would exceed 65535 ZIP entries');
  }
}

export type ZipWriter = {
  add: (path: string, bytes: Uint8Array<ArrayBuffer>, modified?: Date) => void;
  /** Bytes written so far, which is what the archive would weigh today. */
  size: () => number;
  finish: () => Blob;
};

/**
 * Accumulates entries and hands back the finished archive as one Blob.
 *
 * Each entry is turned into its own Blob the moment it is added, and the
 * caller's `Uint8Array` is not retained. That matters on a phone: a Blob
 * is something the browser may keep on disk, whereas an array of typed
 * arrays is heap it must hold until the very end. A hundred photographs
 * therefore cost one photograph of live heap, not a hundred.
 */
export function createZipWriter({
  maxBytes = MAX_ZIP_BYTES,
  maxEntries = MAX_ZIP_ENTRIES,
}: { maxBytes?: number; maxEntries?: number } = {}): ZipWriter {
  const parts: BlobPart[] = [];
  const entries: ZipEntry[] = [];
  let offset = 0;

  return {
    add(path, bytes, modified = new Date()) {
      // Checked before the CRC rather than after: hashing is a pass over
      // every byte, and there is no reason to spend one on an entry that
      // is about to be refused. The header's length is known without it --
      // a fixed part plus the name.
      const headerLength = LOCAL_HEADER_BYTES + encodePath(path).length;
      assertZipRoom(
        offset + headerLength + bytes.length,
        entries.length + 1,
        maxBytes,
        maxEntries,
      );

      const { time, date } = dosDateTime(modified);
      const entry: ZipEntry = {
        path,
        crc: crc32(bytes),
        size: bytes.length,
        offset,
        time,
        date,
      };
      // One Blob per entry, so the bytes stop being live heap here.
      parts.push(new Blob([localFileHeader(entry), bytes]));
      offset += headerLength + bytes.length;
      entries.push(entry);
    },

    size: () => offset,

    finish() {
      const directory = entries.map(centralDirectoryEntry);
      const directorySize = directory.reduce((sum, d) => sum + d.length, 0);
      const total = offset + directorySize + END_OF_CENTRAL_DIR_BYTES;
      assertZipRoom(total, entries.length, maxBytes, maxEntries);
      return new Blob([
        ...parts,
        ...directory,
        endOfCentralDirectory({
          entries: entries.length,
          size: directorySize,
          offset,
        }),
      ]);
    },
  };
}
