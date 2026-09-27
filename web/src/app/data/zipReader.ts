import {
  crc32,
  END_OF_CENTRAL_DIR_BYTES,
  LOCAL_HEADER_BYTES,
  LOCAL_HEADER_SIGNATURE,
  METHOD_STORE,
  ZipReadError,
} from './zip';
import {
  assertWithinReadLimits,
  dataViewOf,
  entryEnds,
  findTrailer,
  MAX_TRAILER_SEARCH,
  parseCentralDirectory,
  ZIP_READ_LIMITS,
  type CentralRecord,
  type ZipReadLimits,
} from './zipDirectory';

/** Reads an entry's bytes out of the archive; until called, nothing past the directory is loaded. */
export type ZipEntryReader = () => Promise<Blob>;

async function readRange(blob: Blob, start: number, end: number) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

/** For two names already known to be the same length. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.every((byte, i) => byte === b[i]);
}

/** Where the entry's data starts, once its local header agrees with the central directory. */
async function dataStartOf(
  archive: Blob,
  record: CentralRecord,
): Promise<number> {
  const headerEnd =
    record.localOffset + LOCAL_HEADER_BYTES + record.nameBytes.length;
  const header = await readRange(archive, record.localOffset, headerEnd);
  const view = dataViewOf(header);
  const agrees =
    view.getUint32(0, true) === LOCAL_HEADER_SIGNATURE &&
    view.getUint16(8, true) === record.method &&
    view.getUint16(26, true) === record.nameBytes.length &&
    sameBytes(header.subarray(LOCAL_HEADER_BYTES), record.nameBytes);
  if (!agrees) {
    throw new ZipReadError(
      `Corrupt archive: "${record.name}" has a local header the directory contradicts`,
    );
  }
  return headerEnd + view.getUint16(28, true);
}

/** Inflates into exactly `size` bytes, cancelling the stream the moment it produces more. */
export async function inflateExactly(
  compressed: Blob,
  size: number,
  name: string,
): Promise<Uint8Array<ArrayBuffer>> {
  const output = new Uint8Array(size);
  const reader = compressed
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
    .getReader();
  let written = 0;
  for (;;) {
    const { done, value } = await reader.read().catch(() => {
      throw new ZipReadError(`Corrupt archive: "${name}" does not inflate`);
    });
    if (done) break;
    if (written + value.length > size) {
      await reader.cancel();
      throw new ZipReadError(
        `Corrupt archive: "${name}" inflates past its declared size`,
      );
    }
    output.set(value, written);
    written += value.length;
  }
  if (written !== size) {
    throw new ZipReadError(
      `Corrupt archive: "${name}" inflates short of its declared size`,
    );
  }
  return output;
}

/** Reads, inflates and checks one entry; a stored entry stays a slice of the file, not a copy. */
function entryReader(
  archive: Blob,
  record: CentralRecord,
  end: number,
): ZipEntryReader {
  return async () => {
    const dataStart = await dataStartOf(archive, record);
    if (dataStart + record.compressedSize > end) {
      throw new ZipReadError(
        `Corrupt archive: "${record.name}" overlaps what follows it`,
      );
    }
    const data = archive.slice(dataStart, dataStart + record.compressedSize);
    const stored = record.method === METHOD_STORE;
    const bytes = stored
      ? new Uint8Array(await data.arrayBuffer())
      : await inflateExactly(data, record.size, record.name);
    if (crc32(bytes) !== record.crc) {
      throw new ZipReadError(
        `Corrupt archive: "${record.name}" fails its checksum`,
      );
    }
    return stored ? data : new Blob([bytes]);
  };
}

/** Opens an archive by its trailer and central directory, the only parts read up front, and refuses one that lies. */
export async function openZip(
  archive: Blob,
  limits: ZipReadLimits = ZIP_READ_LIMITS,
): Promise<Map<string, ZipEntryReader>> {
  if (archive.size < END_OF_CENTRAL_DIR_BYTES) {
    throw new ZipReadError('Not a ZIP archive: file is too small');
  }
  const tailStart = Math.max(0, archive.size - MAX_TRAILER_SEARCH);
  const trailer = findTrailer(
    await readRange(archive, tailStart, archive.size),
    tailStart,
  );
  const records = parseCentralDirectory(
    await readRange(archive, trailer.directoryOffset, trailer.at),
    trailer.entryCount,
  );
  assertWithinReadLimits(records, limits);
  const ends = entryEnds(records, trailer.directoryOffset);
  return new Map(
    records.map((record) => [
      record.name,
      entryReader(archive, record, ends.get(record)!),
    ]),
  );
}
