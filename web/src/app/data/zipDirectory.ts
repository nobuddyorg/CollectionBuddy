import {
  CENTRAL_HEADER_BYTES,
  CENTRAL_HEADER_SIGNATURE,
  END_OF_CENTRAL_DIR_BYTES,
  END_OF_CENTRAL_DIR_SIGNATURE,
  LOCAL_HEADER_BYTES,
  MAX_ZIP_BYTES,
  MAX_ZIP_ENTRIES,
  METHOD_STORE,
  ZipLimitError,
  ZipReadError,
} from './zip';

/** Compression method 8, what every common zip tool re-packs with. */
const METHOD_DEFLATE = 8;

/** General-purpose bit 0: the entry is encrypted. */
const FLAG_ENCRYPTED = 0x0001;

/** The trailer's comment-length field is 16 bits, so the trailer starts no further back than this. */
export const MAX_TRAILER_SEARCH = END_OF_CENTRAL_DIR_BYTES + 0xffff;

export type ZipReadLimits = {
  maxEntries: number;
  /** What one deflated entry may inflate to; a stored entry is its own bytes in the file. */
  maxInflatedEntryBytes: number;
  /** Every entry's uncompressed size, summed. */
  maxTotalBytes: number;
  maxCompressionRatio: number;
  /** Below this a deflated entry may compress past the ratio, as a small text file does. */
  ratioExemptBytes: number;
};

/** An export's own ceilings, and past them only what inflating can reach without holding a tab hostage. */
export const ZIP_READ_LIMITS: ZipReadLimits = {
  maxEntries: MAX_ZIP_ENTRIES,
  maxInflatedEntryBytes: 128 * 1024 * 1024,
  maxTotalBytes: MAX_ZIP_BYTES,
  maxCompressionRatio: 100,
  ratioExemptBytes: 1024 * 1024,
};

/** What the central directory says about one entry; the reader trusts no other header. */
export type CentralRecord = {
  name: string;
  nameBytes: Uint8Array;
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  localOffset: number;
};

type Trailer = {
  at: number;
  entryCount: number;
  directorySize: number;
  directoryOffset: number;
};

export function dataViewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** The end-of-central-directory record, found behind any archive comment a tool appended. */
export function findTrailer(tail: Uint8Array, tailStart: number): Trailer {
  const view = dataViewOf(tail);
  for (let at = tail.length - END_OF_CENTRAL_DIR_BYTES; at >= 0; at--) {
    const commentLength = tail.length - at - END_OF_CENTRAL_DIR_BYTES;
    if (
      view.getUint32(at, true) === END_OF_CENTRAL_DIR_SIGNATURE &&
      view.getUint16(at + 20, true) === commentLength
    ) {
      return readTrailer(view, at, tailStart);
    }
  }
  throw new ZipReadError(
    'Not a ZIP archive: no end-of-central-directory record',
  );
}

function readTrailer(view: DataView, at: number, tailStart: number): Trailer {
  const entryCount = view.getUint16(at + 10, true);
  // Both disk numbers at once: zero reads the same in either byte order.
  const splitAcrossDisks =
    view.getUint32(at + 4) !== 0 || view.getUint16(at + 8, true) !== entryCount;
  if (splitAcrossDisks) {
    throw new ZipReadError('Unsupported archive: split across several files');
  }
  const trailer = {
    at: tailStart + at,
    entryCount,
    directorySize: view.getUint32(at + 12, true),
    directoryOffset: view.getUint32(at + 16, true),
  };
  // Zip64 and prepended stubs both break this: neither is anything an export or a re-pack of one needs.
  if (trailer.directoryOffset + trailer.directorySize !== trailer.at) {
    throw new ZipReadError(
      'Corrupt archive: central directory is not where the trailer says',
    );
  }
  return trailer;
}

const decoder = new TextDecoder();

/** One record and the bytes it spans, name, extra field and comment included. */
function readRecord(
  directory: Uint8Array,
  at: number,
): { record: CentralRecord; length: number } {
  if (at + CENTRAL_HEADER_BYTES > directory.length) {
    throw new ZipReadError(
      'Corrupt archive: central directory runs past its end',
    );
  }
  const view = dataViewOf(directory);
  if (view.getUint32(at, true) !== CENTRAL_HEADER_SIGNATURE) {
    throw new ZipReadError(
      'Corrupt archive: malformed central directory entry',
    );
  }
  const nameLength = view.getUint16(at + 28, true);
  const length =
    CENTRAL_HEADER_BYTES +
    nameLength +
    view.getUint16(at + 30, true) +
    view.getUint16(at + 32, true);
  if (at + length > directory.length) {
    throw new ZipReadError(
      'Corrupt archive: central directory runs past its end',
    );
  }
  const nameBytes = directory.subarray(
    at + CENTRAL_HEADER_BYTES,
    at + CENTRAL_HEADER_BYTES + nameLength,
  );
  const record = {
    name: decoder.decode(nameBytes),
    nameBytes,
    flags: view.getUint16(at + 8, true),
    method: view.getUint16(at + 10, true),
    crc: view.getUint32(at + 16, true),
    compressedSize: view.getUint32(at + 20, true),
    size: view.getUint32(at + 24, true),
    localOffset: view.getUint32(at + 42, true),
  };
  return { record, length };
}

function assertReadable(record: CentralRecord): void {
  if (record.flags & FLAG_ENCRYPTED) {
    throw new ZipReadError(
      `Unsupported archive: "${record.name}" is encrypted`,
    );
  }
  if (record.method !== METHOD_STORE && record.method !== METHOD_DEFLATE) {
    throw new ZipReadError(
      `Unsupported archive: "${record.name}" uses compression method ${record.method}`,
    );
  }
  if (record.method === METHOD_STORE && record.compressedSize !== record.size) {
    throw new ZipReadError(
      `Corrupt archive: stored "${record.name}" has two different sizes`,
    );
  }
}

/** Every record, checked against itself; the directory must hold exactly the trailer's count and nothing more. */
export function parseCentralDirectory(
  directory: Uint8Array,
  entryCount: number,
): CentralRecord[] {
  const records: CentralRecord[] = [];
  const names = new Set<string>();
  let at = 0;
  for (let i = 0; i < entryCount; i++) {
    const { record, length } = readRecord(directory, at);
    assertReadable(record);
    if (names.has(record.name)) {
      throw new ZipReadError(`Corrupt archive: "${record.name}" appears twice`);
    }
    names.add(record.name);
    records.push(record);
    at += length;
  }
  if (at !== directory.length) {
    throw new ZipReadError(
      'Corrupt archive: central directory holds more than its entries',
    );
  }
  return records;
}

/** Refuses, before a byte is inflated, an archive whose declared sizes pass any limit. */
export function assertWithinReadLimits(
  records: CentralRecord[],
  limits: ZipReadLimits,
): void {
  if (records.length > limits.maxEntries) {
    throw new ZipLimitError(
      `Archive holds more than ${limits.maxEntries} entries`,
    );
  }
  let total = 0;
  for (const record of records) {
    total += record.size;
    if (record.method === METHOD_STORE) continue;
    if (record.size > limits.maxInflatedEntryBytes) {
      throw new ZipLimitError(`"${record.name}" inflates past the entry limit`);
    }
    if (
      record.size > limits.ratioExemptBytes &&
      record.size > record.compressedSize * limits.maxCompressionRatio
    ) {
      throw new ZipLimitError(
        `"${record.name}" is compressed past the ratio limit`,
      );
    }
  }
  if (total > limits.maxTotalBytes) {
    throw new ZipLimitError('Archive inflates past the total limit');
  }
}

/** Where each entry's space ends: the next entry's header, or the directory. Overlapping entries are refused. */
export function entryEnds(
  records: CentralRecord[],
  directoryOffset: number,
): Map<CentralRecord, number> {
  const byOffset = [...records].sort((a, b) => a.localOffset - b.localOffset);
  const ends = new Map<CentralRecord, number>();
  byOffset.forEach((record, i) => {
    const end = byOffset[i + 1]?.localOffset ?? directoryOffset;
    const least =
      record.localOffset +
      LOCAL_HEADER_BYTES +
      record.nameBytes.length +
      record.compressedSize;
    if (least > end) {
      throw new ZipReadError(
        `Corrupt archive: "${record.name}" overlaps what follows it`,
      );
    }
    ends.set(record, end);
  });
  return ends;
}
