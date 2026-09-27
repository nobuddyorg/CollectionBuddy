import { crc32 as zlibCrc32, deflateRawSync } from 'node:zlib';

const encoder = new TextEncoder();

type HeaderFields = {
  signature: number;
  flags: number;
  method: number;
  crc: number;
  compressedSize: number;
  size: number;
  name: string;
};

/** One entry as a zip tool writes it, plus any header field a test wants to lie about. */
export type CraftedEntry = {
  name: string;
  data: Uint8Array;
  method?: 'store' | 'deflate';
  /** Info-ZIP's extended-timestamp and Unix-id fields, or any other bytes. */
  extra?: Uint8Array;
  comment?: string;
  /** Zero CRC and sizes in the local header, the real ones in a descriptor after the data, as streaming tools write. */
  dataDescriptor?: boolean;
  /** Compressed bytes to write instead of the deflated `data`. */
  payload?: Uint8Array;
  central?: Partial<HeaderFields & { localOffset: number }>;
  local?: Partial<HeaderFields & { extraLength: number }>;
};

type CraftedTrailer = Partial<{
  entryCount: number;
  entriesOnDisk: number;
  disk: number;
  directorySize: number;
  directoryOffset: number;
}>;

/** An extended-timestamp field (0x5455) followed by a Unix uid/gid field (0x7875), as `zip -r` adds. */
export const INFO_ZIP_EXTRA = new Uint8Array([
  0x55, 0x54, 0x09, 0x00, 0x03, 0x10, 0x20, 0x30, 0x40, 0x10, 0x20, 0x30, 0x40,
  0x75, 0x78, 0x0b, 0x00, 0x01, 0x04, 0xe8, 0x03, 0x00, 0x00, 0x04, 0xe8, 0x03,
  0x00, 0x00,
]);

function writer(length: number) {
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  return {
    bytes,
    u16: (at: number, value: number) => view.setUint16(at, value, true),
    u32: (at: number, value: number) => view.setUint32(at, value, true),
  };
}

function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function trueFields(
  entry: CraftedEntry,
): HeaderFields & { payload: Uint8Array } {
  const deflate = (entry.method ?? 'deflate') === 'deflate';
  const payload =
    entry.payload ?? (deflate ? deflateRawSync(entry.data) : entry.data);
  return {
    signature: 0,
    flags: 0x0800 | (entry.dataDescriptor ? 0x0008 : 0),
    method: deflate ? 8 : 0,
    crc: zlibCrc32(entry.data),
    compressedSize: payload.length,
    size: entry.data.length,
    name: entry.name,
    payload,
  };
}

function localHeader(entry: CraftedEntry): Uint8Array {
  const truth = trueFields(entry);
  const hidden = entry.dataDescriptor
    ? { crc: 0, compressedSize: 0, size: 0 }
    : {};
  const fields = { ...truth, ...hidden, ...entry.local };
  const name = encoder.encode(fields.name);
  const extra = entry.extra ?? new Uint8Array();
  const { bytes, u16, u32 } = writer(30 + name.length + extra.length);
  u32(0, entry.local?.signature ?? 0x04034b50);
  u16(4, 20);
  u16(6, fields.flags);
  u16(8, fields.method);
  u32(14, fields.crc);
  u32(18, fields.compressedSize);
  u32(22, fields.size);
  u16(26, name.length);
  u16(28, entry.local?.extraLength ?? extra.length);
  bytes.set(name, 30);
  bytes.set(extra, 30 + name.length);
  return bytes;
}

function descriptor(entry: CraftedEntry): Uint8Array {
  const truth = trueFields(entry);
  const { bytes, u32 } = writer(16);
  u32(0, 0x08074b50);
  u32(4, truth.crc);
  u32(8, truth.compressedSize);
  u32(12, truth.size);
  return bytes;
}

function centralRecord(entry: CraftedEntry, localOffset: number): Uint8Array {
  const fields = { ...trueFields(entry), localOffset, ...entry.central };
  const name = encoder.encode(fields.name);
  const extra = entry.extra ?? new Uint8Array();
  const comment = encoder.encode(entry.comment ?? '');
  const { bytes, u16, u32 } = writer(
    46 + name.length + extra.length + comment.length,
  );
  u32(0, entry.central?.signature ?? 0x02014b50);
  u16(4, 0x031e);
  u16(6, 20);
  u16(8, fields.flags);
  u16(10, fields.method);
  u32(16, fields.crc);
  u32(20, fields.compressedSize);
  u32(24, fields.size);
  u16(28, name.length);
  u16(30, extra.length);
  u16(32, comment.length);
  u32(42, fields.localOffset);
  bytes.set(name, 46);
  bytes.set(extra, 46 + name.length);
  bytes.set(comment, 46 + name.length + extra.length);
  return bytes;
}

/** A ZIP laid out the way common tools lay one out, deflated by default; every field can be made to lie. */
export function craftZip({
  entries,
  comment = '',
  trailer = {},
  prefix = new Uint8Array(),
  order,
}: {
  entries: CraftedEntry[];
  /** The directory's record order, when it should differ from the order of the data. */
  order?: number[];
  comment?: string;
  trailer?: CraftedTrailer;
  /** Bytes before the first entry, as a self-extracting stub puts there. */
  prefix?: Uint8Array;
}): Uint8Array<ArrayBuffer> {
  const parts: Uint8Array[] = [prefix];
  const records: Uint8Array[] = [];
  let offset = prefix.length;
  for (const entry of entries) {
    const header = localHeader(entry);
    const { payload } = trueFields(entry);
    const tail = entry.dataDescriptor ? descriptor(entry) : new Uint8Array();
    records.push(centralRecord(entry, offset));
    parts.push(header, payload, tail);
    offset += header.length + payload.length + tail.length;
  }
  const directory = concat(order ? order.map((i) => records[i]) : records);
  const commentBytes = encoder.encode(comment);
  const { bytes, u16, u32 } = writer(22 + commentBytes.length);
  u32(0, 0x06054b50);
  u16(4, trailer.disk ?? 0);
  u16(8, trailer.entriesOnDisk ?? trailer.entryCount ?? entries.length);
  u16(10, trailer.entryCount ?? entries.length);
  u32(12, trailer.directorySize ?? directory.length);
  u32(16, trailer.directoryOffset ?? offset);
  u16(20, commentBytes.length);
  bytes.set(commentBytes, 22);
  return concat([...parts, directory, bytes]);
}

export async function textOf(blob: Blob): Promise<string> {
  return new TextDecoder().decode(await blob.arrayBuffer());
}

/** `zip -qr - Coins | cat` (Info-ZIP 3.0, piped): deflated, data descriptors, directory entries, timestamp and uid extras. */
export const INFO_ZIP_STREAMED = Uint8Array.from(
  atob(
    'UEsDBAoAAAAAAAAAIVwAAAAAAAAAAAAAAAAGABwAQ29pbnMvVVQJAAMAuVVp' +
      'AzW5anV4CwABBAAAAAAEAAAAAFBLAwQUAAgACAAAACFcAAAAAAAAAABhAAAA' +
      'FQAcAENvaW5zL2NvbGxlY3Rpb24uanNvblVUCQADALlVaQM1uWp1eAsAAQQA' +
      'AAAABAAAAAA1zLENgCAQBdBdfo2FLTs4gbFAOI2JcAZOIxI2s3Mxbaxf8gom' +
      'jt4INCyvK1lZOIy7c7mxRmjmmBs6N44ChYNi+hi6VfgVuiAYT1/QPXe4KKAq' +
      'LEI+QfdDfQFQSwcI8rZe81oAAABhAAAAUEsDBAoAAAAAAAAAIVwAAAAAAAAA' +
      'AAAAAAANABwAQ29pbnMvcGhvdG9zL1VUCQADALlVaQM1uWp1eAsAAQQAAAAA' +
      'BAAAAABQSwMECgAAAAAAAAAhXAAAAAAAAAAAAAAAABMAHABDb2lucy9waG90' +
      'b3MvMDAxLWEvVVQJAAMAuVVpAzW5anV4CwABBAAAAAAEAAAAAFBLAwQUAAgA' +
      'CAAAACFcAAAAAAAAAAAgAAAAGQAcAENvaW5zL3Bob3Rvcy8wMDEtYS8xLndl' +
      'YnBVVAkAAwC5VWkDNblqdXgLAAEEAAAAAAQAAAAAC/DwD/F3igxxDdYNwMYE' +
      'AFBLBwiYDItzEAAAACAAAABQSwECHgMKAAAAAAAAACFcAAAAAAAAAAAAAAAA' +
      'BgAYAAAAAAAAABAA7UEAAAAAQ29pbnMvVVQFAAMAuVVpdXgLAAEEAAAAAAQA' +
      'AAAAUEsBAh4DFAAIAAgAAAAhXPK2XvNaAAAAYQAAABUAGAAAAAAAAQAAAKSB' +
      'QAAAAENvaW5zL2NvbGxlY3Rpb24uanNvblVUBQADALlVaXV4CwABBAAAAAAE' +
      'AAAAAFBLAQIeAwoAAAAAAAAAIVwAAAAAAAAAAAAAAAANABgAAAAAAAAAEADt' +
      'QfkAAABDb2lucy9waG90b3MvVVQFAAMAuVVpdXgLAAEEAAAAAAQAAAAAUEsB' +
      'Ah4DCgAAAAAAAAAhXAAAAAAAAAAAAAAAABMAGAAAAAAAAAAQAO1BQAEAAENv' +
      'aW5zL3Bob3Rvcy8wMDEtYS9VVAUAAwC5VWl1eAsAAQQAAAAABAAAAABQSwEC' +
      'HgMUAAgACAAAACFcmAyLcxAAAAAgAAAAGQAYAAAAAAABAAAApIGNAQAAQ29p' +
      'bnMvcGhvdG9zLzAwMS1hLzEud2VicFVUBQADALlVaXV4CwABBAAAAAAEAAAA' +
      'AFBLBQYAAAAABQAFALIBAAAAAgAAAAA=',
  ),
  (character) => character.charCodeAt(0),
);
