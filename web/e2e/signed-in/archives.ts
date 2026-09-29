import { readFileSync, writeFileSync } from 'node:fs';
import { crc32, deflateRawSync } from 'node:zlib';

// Black box: the app's own reader is not imported, so these bytes are written the way outside tools write them.

type Entry = { name: string; data: Uint8Array };

/** Every entry of a store-only archive, found through its central directory. */
function readStoredEntries(archive: Buffer): Entry[] {
  const trailer = archive.length - 22;
  const count = archive.readUInt16LE(trailer + 10);
  let at = archive.readUInt32LE(trailer + 16);
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    const size = archive.readUInt32LE(at + 24);
    const nameLength = archive.readUInt16LE(at + 28);
    const local = archive.readUInt32LE(at + 42);
    const name = archive.toString('utf8', at + 46, at + 46 + nameLength);
    const start =
      local +
      30 +
      archive.readUInt16LE(local + 26) +
      archive.readUInt16LE(local + 28);
    entries.push({ name, data: archive.subarray(start, start + size) });
    at +=
      46 +
      nameLength +
      archive.readUInt16LE(at + 30) +
      archive.readUInt16LE(at + 32);
  }
  return entries;
}

/** Info-ZIP's extended-timestamp extra field. */
const TIMESTAMP_EXTRA = Buffer.from([0x55, 0x54, 0x05, 0x00, 0x03, 0, 0, 0, 0]);

type Lies = { declaredSize?: number };

const LOCAL_FILE_SIGNATURE = 0x04034b50;
const DATA_DESCRIPTOR_SIGNATURE = 0x08074b50;
const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;

function localFileHeader({ nameLength }: { nameLength: number }): Buffer {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(LOCAL_FILE_SIGNATURE, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0808, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt16LE(nameLength, 26);
  header.writeUInt16LE(TIMESTAMP_EXTRA.length, 28);
  return header;
}

type EntryDescriptor = { crc: number; compressedSize: number; size: number };

function dataDescriptor({
  crc,
  compressedSize,
  size,
}: EntryDescriptor): Buffer {
  const descriptor = Buffer.alloc(16);
  descriptor.writeUInt32LE(DATA_DESCRIPTOR_SIGNATURE, 0);
  descriptor.writeUInt32LE(crc, 4);
  descriptor.writeUInt32LE(compressedSize, 8);
  descriptor.writeUInt32LE(size, 12);
  return descriptor;
}

function centralDirectoryHeader({
  nameLength,
  crc,
  compressedSize,
  size,
  offset,
}: EntryDescriptor & { nameLength: number; offset: number }): Buffer {
  const header = Buffer.alloc(46);
  header.writeUInt32LE(CENTRAL_DIRECTORY_SIGNATURE, 0);
  header.writeUInt16LE(0x031e, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0808, 8);
  header.writeUInt16LE(8, 10);
  header.writeUInt32LE(crc, 16);
  header.writeUInt32LE(compressedSize, 20);
  header.writeUInt32LE(size, 24);
  header.writeUInt16LE(nameLength, 28);
  header.writeUInt16LE(TIMESTAMP_EXTRA.length, 30);
  header.writeUInt32LE(offset, 42);
  return header;
}

function endOfCentralDirectory({
  count,
  directorySize,
  directoryOffset,
  commentLength,
}: {
  count: number;
  directorySize: number;
  directoryOffset: number;
  commentLength: number;
}): Buffer {
  const trailer = Buffer.alloc(22);
  trailer.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  trailer.writeUInt16LE(count, 8);
  trailer.writeUInt16LE(count, 10);
  trailer.writeUInt32LE(directorySize, 12);
  trailer.writeUInt32LE(directoryOffset, 16);
  trailer.writeUInt16LE(commentLength, 20);
  return trailer;
}

/** Deflated, a data descriptor after each entry, an extra field and an archive comment: a zip tool writing to a pipe. */
function writeAsZipTool(
  entries: Entry[],
  lies: Record<string, Lies> = {},
): Buffer {
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const compressed = deflateRawSync(data);
    const sizes = {
      crc: crc32(data),
      compressedSize: compressed.length,
      size: lies[name]?.declaredSize ?? data.length,
    };
    const written = [
      localFileHeader({ nameLength: nameBytes.length }),
      nameBytes,
      TIMESTAMP_EXTRA,
      compressed,
      dataDescriptor(sizes),
    ];
    parts.push(...written);
    directory.push(
      centralDirectoryHeader({
        ...sizes,
        nameLength: nameBytes.length,
        offset,
      }),
      nameBytes,
      TIMESTAMP_EXTRA,
    );
    offset += written.reduce((sum, part) => sum + part.length, 0);
  }
  const directoryBytes = Buffer.concat(directory);
  const comment = Buffer.from('packed again', 'utf8');
  const trailer = endOfCentralDirectory({
    count: entries.length,
    directorySize: directoryBytes.length,
    directoryOffset: offset,
    commentLength: comment.length,
  });
  return Buffer.concat([...parts, directoryBytes, trailer, comment]);
}

/** The export at `exported`, unpacked and packed again the way a zip tool does, written to `to`. */
export function repackLikeZipTool(exported: string, to: string): void {
  writeFileSync(to, writeAsZipTool(readStoredEntries(readFileSync(exported))));
}

/** The export at `exported`, its folder's contents packed again without the folder, as selecting them all and zipping does. */
export function repackContentsLikeZipTool(exported: string, to: string): void {
  const contents = readStoredEntries(readFileSync(exported))
    .map(({ name, data }) => ({
      name: name.slice(name.indexOf('/') + 1),
      data,
    }))
    .filter(({ name }) => name !== '');
  writeFileSync(to, writeAsZipTool(contents));
}

/** A small archive whose manifest claims to inflate to `declaredSize` bytes, written to `to`. */
export function writeArchiveClaiming(
  { category, declaredSize }: { category: string; declaredSize: number },
  to: string,
): void {
  const name = 'CollectionBuddy-bomb/collection.json';
  const manifest = {
    format: 'collectionbuddy-category-export',
    version: 1,
    category: { id: 'x', name: category },
    items: [],
  };
  const data = Buffer.from(JSON.stringify(manifest), 'utf8');
  writeFileSync(
    to,
    writeAsZipTool([{ name, data }], { [name]: { declaredSize } }),
  );
}
