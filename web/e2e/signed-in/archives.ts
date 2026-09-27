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
    const crc = crc32(data);
    const size = lies[name]?.declaredSize ?? data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0808, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(TIMESTAMP_EXTRA.length, 28);
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(0x08074b50, 0);
    descriptor.writeUInt32LE(crc, 4);
    descriptor.writeUInt32LE(compressed.length, 8);
    descriptor.writeUInt32LE(size, 12);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0808, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt16LE(TIMESTAMP_EXTRA.length, 30);
    central.writeUInt32LE(offset, 42);

    const written = [local, nameBytes, TIMESTAMP_EXTRA, compressed, descriptor];
    parts.push(...written);
    directory.push(central, nameBytes, TIMESTAMP_EXTRA);
    offset += written.reduce((sum, part) => sum + part.length, 0);
  }
  const directoryBytes = Buffer.concat(directory);
  const comment = Buffer.from('packed again', 'utf8');
  const trailer = Buffer.alloc(22);
  trailer.writeUInt32LE(0x06054b50, 0);
  trailer.writeUInt16LE(entries.length, 8);
  trailer.writeUInt16LE(entries.length, 10);
  trailer.writeUInt32LE(directoryBytes.length, 12);
  trailer.writeUInt32LE(offset, 16);
  trailer.writeUInt16LE(comment.length, 20);
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
