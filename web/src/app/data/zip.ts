// Store-only and no Zip64: the 4 GiB / 65535-entry ceilings are refused, never rolled over.

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

/** Past these the 32-bit header fields cannot describe the archive without Zip64. */
export const MAX_ZIP_BYTES = 0xffffffff;
export const MAX_ZIP_ENTRIES = 0xffff;

const CRC32_POLYNOMIAL = 0xedb88320;

// Built on first use, not at module load: importing this module for a type costs no table.
let crcTable: Uint32Array | null = null;

function crc32Step(crc: number): number {
  return crc & 1 ? CRC32_POLYNOMIAL ^ (crc >>> 1) : crc >>> 1;
}

function crc32TableEntry(byte: number): number {
  return Array.from({ length: 8 }).reduce<number>(crc32Step, byte) >>> 0;
}

export function crc32Table(): Uint32Array {
  if (crcTable) return crcTable;
  crcTable = Uint32Array.from({ length: 256 }, (_, byte) =>
    crc32TableEntry(byte),
  );
  return crcTable;
}

/** IEEE CRC-32 of `bytes`, as the unsigned value the headers carry. */
export function crc32(bytes: Uint8Array): number {
  const table = crc32Table();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Packed MS-DOS time and date; a year outside 1980-2107 clamps to 1980-01-01 instead of wrapping. */
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

// The name-length header field is bytes, not characters -- an umlaut is two.
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

/** A zero-filled header buffer with little-endian field writers, as every ZIP field is. */
function headerBuffer(length: number): {
  bytes: Uint8Array<ArrayBuffer>;
  uint16: (offset: number, value: number) => void;
  uint32: (offset: number, value: number) => void;
} {
  const bytes = new Uint8Array(length);
  const dataView = new DataView(bytes.buffer);
  return {
    bytes,
    uint16: (offset, value) => dataView.setUint16(offset, value, true),
    uint32: (offset, value) => dataView.setUint32(offset, value, true),
  };
}

/** The 30-byte header (plus name) that precedes an entry's bytes. */
export function localFileHeader(entry: ZipEntry): Uint8Array<ArrayBuffer> {
  const name = encodePath(entry.path);
  const { bytes, uint16, uint32 } = headerBuffer(
    LOCAL_HEADER_BYTES + name.length,
  );
  uint32(0, LOCAL_HEADER_SIGNATURE);
  uint16(4, VERSION);
  uint16(6, FLAG_UTF8);
  uint16(8, METHOD_STORE);
  uint16(10, entry.time);
  uint16(12, entry.date);
  uint32(14, entry.crc);
  // Stored, so the compressed and uncompressed sizes are the same number.
  uint32(18, entry.size);
  uint32(22, entry.size);
  uint16(26, name.length);
  bytes.set(name, LOCAL_HEADER_BYTES);
  return bytes;
}

/** The 46-byte central-directory record (plus name) for one entry. */
export function centralDirectoryEntry(
  entry: ZipEntry,
): Uint8Array<ArrayBuffer> {
  const name = encodePath(entry.path);
  const { bytes, uint16, uint32 } = headerBuffer(
    CENTRAL_HEADER_BYTES + name.length,
  );
  uint32(0, CENTRAL_HEADER_SIGNATURE);
  uint16(4, VERSION);
  uint16(6, VERSION);
  uint16(8, FLAG_UTF8);
  uint16(10, METHOD_STORE);
  uint16(12, entry.time);
  uint16(14, entry.date);
  uint32(16, entry.crc);
  uint32(20, entry.size);
  uint32(24, entry.size);
  uint16(28, name.length);
  // Bytes 30-41 (extra, comment, disk, attributes) stay zero.
  uint32(42, entry.offset);
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
  const { bytes, uint16, uint32 } = headerBuffer(END_OF_CENTRAL_DIR_BYTES);
  uint32(0, END_OF_CENTRAL_DIR_SIGNATURE);
  // Bytes 4-7 (this disk, the directory's disk) and 20-21 (comment length) stay zero.
  uint16(8, entries);
  uint16(10, entries);
  uint32(12, size);
  uint32(16, offset);
  return bytes;
}

export class ZipReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipReadError';
  }
}

/** Reads an entry's bytes out of the archive; until called, nothing past the directory is loaded. */
export type ZipEntryReader = () => Promise<Blob>;

async function readRange(blob: Blob, start: number, end: number) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

function dataViewOf(bytes: Uint8Array<ArrayBuffer>): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** A slice of the archive, not a copy: the local header is read only to find where the bytes start. */
function entryReader({
  archive,
  name,
  size,
  localOffset,
}: {
  archive: Blob;
  name: string;
  size: number;
  localOffset: number;
}): ZipEntryReader {
  return async () => {
    const header = await readRange(
      archive,
      localOffset,
      localOffset + LOCAL_HEADER_BYTES,
    );
    if (header.length < LOCAL_HEADER_BYTES) {
      throw new ZipReadError(`Corrupt archive: "${name}" runs past the file`);
    }
    const localNameLength = dataViewOf(header).getUint16(26, true);
    const dataStart = localOffset + LOCAL_HEADER_BYTES + localNameLength;
    if (dataStart + size > archive.size) {
      throw new ZipReadError(`Corrupt archive: "${name}" runs past the file`);
    }
    return archive.slice(dataStart, dataStart + size);
  };
}

/** Opens an archive `createZipWriter` produced by its trailer and central directory, the only parts read up front. */
export async function openZip(
  archive: Blob,
): Promise<Map<string, ZipEntryReader>> {
  if (archive.size < END_OF_CENTRAL_DIR_BYTES) {
    throw new ZipReadError('Not a ZIP archive: file is too small');
  }
  const trailerAt = archive.size - END_OF_CENTRAL_DIR_BYTES;
  const trailer = dataViewOf(await readRange(archive, trailerAt, archive.size));
  if (trailer.getUint32(0, true) !== END_OF_CENTRAL_DIR_SIGNATURE) {
    // No backward scan for an archive comment: `createZipWriter` never writes one.
    throw new ZipReadError(
      'Not a ZIP archive: no end-of-central-directory record',
    );
  }

  const entryCount = trailer.getUint16(8, true);
  const directoryOffset = trailer.getUint32(16, true);
  // Up to the end of the file, not the trailer: a directory the trailer misplaces is judged by the bytes found there.
  const directory = await readRange(archive, directoryOffset, archive.size);
  const dataView = dataViewOf(directory);

  const entries = new Map<string, ZipEntryReader>();
  const decoder = new TextDecoder();
  let directoryAt = 0;
  for (let i = 0; i < entryCount; i++) {
    if (directoryAt + CENTRAL_HEADER_BYTES > directory.length) {
      throw new ZipReadError(
        'Corrupt archive: central directory runs past the file',
      );
    }
    if (dataView.getUint32(directoryAt, true) !== CENTRAL_HEADER_SIGNATURE) {
      throw new ZipReadError(
        'Corrupt archive: malformed central directory entry',
      );
    }
    const size = dataView.getUint32(directoryAt + 24, true);
    const nameLength = dataView.getUint16(directoryAt + 28, true);
    const localOffset = dataView.getUint32(directoryAt + 42, true);
    const name = decoder.decode(
      directory.subarray(
        directoryAt + CENTRAL_HEADER_BYTES,
        directoryAt + CENTRAL_HEADER_BYTES + nameLength,
      ),
    );
    entries.set(name, entryReader({ archive, name, size, localOffset }));

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

/** Refuses what the 32-bit headers cannot describe; a test lowers the limits to reach them cheaply. */
export function assertZipRoom({
  totalBytes,
  entryCount,
  maxBytes = MAX_ZIP_BYTES,
  maxEntries = MAX_ZIP_ENTRIES,
}: {
  totalBytes: number;
  entryCount: number;
  maxBytes?: number;
  maxEntries?: number;
}): void {
  if (totalBytes > maxBytes) {
    throw new ZipLimitError('Archive would exceed the 4 GiB ZIP limit');
  }
  if (entryCount > maxEntries) {
    throw new ZipLimitError('Archive would exceed 65535 ZIP entries');
  }
}

export type ZipWriter = {
  add: (entry: {
    path: string;
    bytes: Uint8Array<ArrayBuffer>;
    modified?: Date;
  }) => void;
  /** Bytes written so far, which is what the archive would weigh today. */
  size: () => number;
  finish: () => Blob;
};

/** Each entry becomes its own Blob as it is added, so a hundred photographs cost one in heap. */
export function createZipWriter({
  maxBytes = MAX_ZIP_BYTES,
  maxEntries = MAX_ZIP_ENTRIES,
}: { maxBytes?: number; maxEntries?: number } = {}): ZipWriter {
  const parts: BlobPart[] = [];
  const entries: ZipEntry[] = [];
  let offset = 0;

  return {
    add({ path, bytes, modified = new Date() }) {
      // Checked before the CRC: hashing is a pass over every byte of an entry about to be refused.
      const headerLength = LOCAL_HEADER_BYTES + encodePath(path).length;
      assertZipRoom({
        totalBytes: offset + headerLength + bytes.length,
        entryCount: entries.length + 1,
        maxBytes,
        maxEntries,
      });

      const { time, date } = dosDateTime(modified);
      const entry: ZipEntry = {
        path,
        crc: crc32(bytes),
        size: bytes.length,
        offset,
        time,
        date,
      };
      parts.push(new Blob([localFileHeader(entry), bytes]));
      offset += headerLength + bytes.length;
      entries.push(entry);
    },

    size: () => offset,

    finish() {
      const directory = entries.map(centralDirectoryEntry);
      const directorySize = directory.reduce(
        (sum, record) => sum + record.length,
        0,
      );
      const total = offset + directorySize + END_OF_CENTRAL_DIR_BYTES;
      assertZipRoom({
        totalBytes: total,
        entryCount: entries.length,
        maxBytes,
        maxEntries,
      });
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
