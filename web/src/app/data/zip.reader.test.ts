import { describe, expect, it } from 'vitest';

import { createZipWriter, readZipEntries, ZipReadError } from './zip';
import { encoder, bytesOf } from './zip.test-support';

async function oneEntryArchive(): Promise<Uint8Array<ArrayBuffer>> {
  const writer = createZipWriter();
  writer.add({ path: 'a.txt', bytes: new Uint8Array([1, 2, 3]) });
  return bytesOf(writer.finish());
}

function dataViewOf(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

// Every archive read back here was produced by createZipWriter, so a round trip proves they agree.
describe('readZipEntries', () => {
  it('reads back every entry a writer produced, byte for byte', async () => {
    const writer = createZipWriter();
    writer.add({ path: 'collection.json', bytes: encoder.encode('{"a":1}') });
    writer.add({
      path: 'photos/1.webp',
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
    });
    const entries = await readZipEntries(writer.finish());

    expect(entries.size).toBe(2);
    expect(new TextDecoder().decode(entries.get('collection.json'))).toBe(
      '{"a":1}',
    );
    expect(entries.get('photos/1.webp')).toEqual(
      new Uint8Array([1, 2, 3, 4, 5]),
    );
  });

  it('reads an empty archive as an empty map, not an error', async () => {
    const entries = await readZipEntries(createZipWriter().finish());
    expect(entries.size).toBe(0);
  });

  it('keeps entries with the same name apart by path, not by basename', async () => {
    const writer = createZipWriter();
    writer.add({ path: 'a/1.webp', bytes: new Uint8Array([1]) });
    writer.add({ path: 'b/1.webp', bytes: new Uint8Array([2]) });
    const entries = await readZipEntries(writer.finish());

    expect(entries.get('a/1.webp')).toEqual(new Uint8Array([1]));
    expect(entries.get('b/1.webp')).toEqual(new Uint8Array([2]));
  });

  it('rejects a file too small to hold even the end-of-central-directory record', async () => {
    await expect(
      readZipEntries(new Blob([new Uint8Array(10)])),
    ).rejects.toThrow(/file is too small/);
  });

  // Both bounds are `>`, not `>=`: a structure ending on the file's last byte is inside the file.
  it('reads an entry whose data ends on the very last byte', async () => {
    const bytes = await oneEntryArchive();
    const dataView = dataViewOf(bytes);
    const directoryAt = bytes.length - 22 - (46 + 'a.txt'.length);
    const dataStart = 30 + 'a.txt'.length;
    dataView.setUint32(directoryAt + 24, bytes.length - dataStart, true);

    const entries = await readZipEntries(new Blob([bytes]));

    expect(entries.get('a.txt')).toHaveLength(bytes.length - dataStart);
  });

  it('reads a directory pointer that leaves exactly one header of room', async () => {
    const bytes = await oneEntryArchive();
    const dataView = dataViewOf(bytes);
    // Not past the end, so the bound lets it through; the signature found there is what rejects it.
    dataView.setUint32(bytes.length - 22 + 16, bytes.length - 46, true);

    await expect(readZipEntries(new Blob([bytes]))).rejects.toThrow(
      /malformed central directory entry/,
    );
  });

  it('rejects a file with no end-of-central-directory signature at all', async () => {
    const junk = new Uint8Array(30);
    await expect(readZipEntries(new Blob([junk]))).rejects.toThrow(
      /end-of-central-directory/,
    );
  });

  it('rejects a directory entry claiming a size that runs past the file', async () => {
    const bytes = await oneEntryArchive();
    // The one entry's size field sits 24 bytes into its directory record, which precedes the trailer.
    const directoryAt = bytes.length - 22 - (46 + 'a.txt'.length);
    dataViewOf(bytes).setUint32(directoryAt + 24, 0xffffff, true);
    await expect(readZipEntries(new Blob([bytes]))).rejects.toThrow(
      /runs past the file/,
    );
  });

  it('rejects when the end-of-central-directory record claims more entries than the file actually holds', async () => {
    const bytes = await oneEntryArchive();
    const dataView = dataViewOf(bytes);
    const trailerAt = bytes.length - 22;
    // Both entry-count fields say 2 for one real entry, so the second directory pointer overruns.
    dataView.setUint16(trailerAt + 8, 2, true);
    dataView.setUint16(trailerAt + 10, 2, true);
    await expect(readZipEntries(new Blob([bytes]))).rejects.toThrow(
      /central directory runs past the file/,
    );
  });

  it('rejects a central directory entry with the wrong signature', async () => {
    const bytes = await oneEntryArchive();
    const directoryAt = bytes.length - 22 - (46 + 'a.txt'.length);
    dataViewOf(bytes).setUint32(directoryAt, 0xdeadbeef, true);
    await expect(readZipEntries(new Blob([bytes]))).rejects.toThrow(
      /malformed central directory entry/,
    );
  });

  it('names its errors, so a caller can tell them from any other failure', () => {
    expect(new ZipReadError('x').name).toBe('ZipReadError');
    expect(new ZipReadError('x')).toBeInstanceOf(Error);
  });
});
