import { describe, expect, it, vi } from 'vitest';

import { createZipWriter, ZipReadError } from './zip';
import { openZip } from './zipReader';
import {
  bytesOf,
  craftZip,
  INFO_ZIP_EXTRA,
  INFO_ZIP_STREAMED,
  JSON_BYTES,
  JSON_TEXT,
  open,
  textOf,
  type CraftedEntry,
} from './zipReader.test-support';

const encoder = new TextEncoder();

// Every entry's bytes, read the way the import reads one photograph at a time.
async function readAll(bytes: Uint8Array<ArrayBuffer>) {
  const entries = new Map<string, Uint8Array>();
  for (const [path, read] of await open(bytes)) {
    entries.set(path, await bytesOf(await read()));
  }
  return entries;
}

async function readOne(entries: CraftedEntry[], name = entries[0].name) {
  const read = (await open(craftZip({ entries }))).get(name)!;
  return read();
}

describe('openZip, on what the export writes', () => {
  it('reads back every entry a writer produced, byte for byte', async () => {
    const writer = createZipWriter();
    writer.add({ path: 'collection.json', bytes: encoder.encode('{"a":1}') });
    writer.add({ path: 'photos/1.webp', bytes: new Uint8Array([1, 2, 3]) });
    const entries = await readAll(await bytesOf(writer.finish()));

    expect(entries.size).toBe(2);
    expect(new TextDecoder().decode(entries.get('collection.json'))).toBe(
      '{"a":1}',
    );
    expect(entries.get('photos/1.webp')).toEqual(new Uint8Array([1, 2, 3]));
  });

  // A photograph's bytes stay in the file until its upload asks for them.
  it('reads no more than the trailer search and the directory up front', async () => {
    const writer = createZipWriter();
    // Three times the bound below, so reading it up front would fail the test.
    const photo = new Uint8Array(200_000).fill(7);
    writer.add({ path: 'p.webp', bytes: photo });
    const archive = writer.finish();
    const sliced: number[] = [];
    const watched = {
      size: archive.size,
      slice: (start: number, end: number) => {
        sliced.push(end - start);
        return archive.slice(start, end);
      },
    } as Blob;

    const entries = await openZip(watched);

    const upFront = sliced.reduce((sum, length) => sum + length, 0);
    expect(upFront).toBeLessThan(22 + 0xffff + 100);
    const read = await bytesOf(await entries.get('p.webp')!());
    // A deep toEqual walks 200,000 elements one by one; Buffer compares the bytes at once.
    expect(Buffer.from(read).equals(Buffer.from(photo))).toBe(true);
  });

  it('reads an empty archive as an empty map, not an error', async () => {
    const entries = await openZip(createZipWriter().finish());
    expect(entries.size).toBe(0);
  });

  it('keeps entries with the same name apart by path, not by basename', async () => {
    const writer = createZipWriter();
    writer.add({ path: 'a/1.webp', bytes: new Uint8Array([1]) });
    writer.add({ path: 'b/1.webp', bytes: new Uint8Array([2]) });
    const entries = await readAll(await bytesOf(writer.finish()));

    expect(entries.get('a/1.webp')).toEqual(new Uint8Array([1]));
    expect(entries.get('b/1.webp')).toEqual(new Uint8Array([2]));
  });

  it('hands a stored entry out as a slice of the file, not a copy', async () => {
    const archive = new Blob([
      craftZip({ entries: [{ name: 'a', data: JSON_BYTES, method: 'store' }] }),
    ]);
    const slice = vi.spyOn(archive, 'slice');
    const read = await (await openZip(archive)).get('a')!();

    expect(await textOf(read)).toBe(JSON_TEXT);
    expect(slice).toHaveReturnedWith(read);
  });
});

// An export unzipped to browse the photographs and zipped again by the OS.
describe('openZip, on an export a common tool packed again', () => {
  it('reads what Info-ZIP writes to a pipe', async () => {
    const entries = await readAll(INFO_ZIP_STREAMED);

    expect([...entries.keys()]).toEqual([
      'Coins/',
      'Coins/collection.json',
      'Coins/photos/',
      'Coins/photos/001-a/',
      'Coins/photos/001-a/1.webp',
    ]);
    expect(
      JSON.parse(
        new TextDecoder().decode(entries.get('Coins/collection.json')),
      ),
    ).toMatchObject({ category: { name: 'Münzen' } });
    expect(
      new TextDecoder().decode(entries.get('Coins/photos/001-a/1.webp')),
    ).toBe('PHOTOBYTES-PHOTOBYTES-PHOTOBYTES');
  });

  it('reads deflated entries with extra fields, comments and data descriptors', async () => {
    const photo = new Uint8Array(3000).map((_, i) => (i * 7919) % 251);
    const entries = await readAll(
      craftZip({
        entries: [
          {
            name: 'C/collection.json',
            data: JSON_BYTES,
            extra: INFO_ZIP_EXTRA,
            comment: 'the manifest',
            dataDescriptor: true,
          },
          { name: 'C/photos/', data: new Uint8Array(), method: 'store' },
          {
            name: 'C/photos/001-a/1.webp',
            data: photo,
            extra: INFO_ZIP_EXTRA,
            dataDescriptor: true,
          },
        ],
        comment: 'packed again',
      }),
    );

    expect(new TextDecoder().decode(entries.get('C/collection.json'))).toBe(
      JSON_TEXT,
    );
    expect(entries.get('C/photos/')).toEqual(new Uint8Array());
    expect(entries.get('C/photos/001-a/1.webp')).toEqual(photo);
  });

  it('finds the trailer behind the longest comment the format allows', async () => {
    const entries = await readAll(
      craftZip({
        entries: [{ name: 'a', data: JSON_BYTES }],
        comment: 'x'.repeat(0xffff),
      }),
    );
    expect(entries.get('a')).toEqual(JSON_BYTES);
  });

  // The comment's last bytes are no trailer: its length field would say 0 with 3 bytes after it.
  it('is not fooled by a trailer signature inside the comment', async () => {
    const fake = new TextDecoder('latin1').decode(
      new Uint8Array([
        0x50,
        0x4b,
        0x05,
        0x06,
        ...new Array<number>(18).fill(0),
      ]),
    );
    const entries = await readAll(
      craftZip({
        entries: [{ name: 'a', data: JSON_BYTES }],
        comment: `${fake}xyz`,
      }),
    );
    expect(entries.get('a')).toEqual(JSON_BYTES);
  });

  it('reads an entry the directory lists before one that precedes it in the file', async () => {
    const entries = await readAll(
      craftZip({
        entries: [
          { name: 'first', data: encoder.encode('one') },
          { name: 'second', data: encoder.encode('two') },
        ],
        order: [1, 0],
      }),
    );
    expect(new TextDecoder().decode(entries.get('first'))).toBe('one');
    expect(new TextDecoder().decode(entries.get('second'))).toBe('two');
  });

  it('decodes names as UTF-8', async () => {
    const entries = await readAll(
      craftZip({ entries: [{ name: 'Münzen/ä.txt', data: JSON_BYTES }] }),
    );
    expect([...entries.keys()]).toEqual(['Münzen/ä.txt']);
  });
});

describe('openZip, on a file that is not a readable ZIP', () => {
  it('rejects a file too small to hold even the trailer', async () => {
    await expect(open(new Uint8Array(21))).rejects.toThrow(/too small/);
  });

  it('rejects a file with no trailer signature at all', async () => {
    const failure = open(new Uint8Array(30));
    await expect(failure).rejects.toBeInstanceOf(ZipReadError);
    await expect(failure).rejects.toThrow(/end-of-central-directory/);
  });

  it('rejects a trailer whose comment length does not reach the end of the file', async () => {
    const bytes = craftZip({ entries: [], comment: 'ab' });
    const trimmed = bytes.slice(0, bytes.length - 1);
    await expect(open(trimmed)).rejects.toThrow(/end-of-central-directory/);
  });

  it.each([
    ['this disk', { disk: 1 }],
    ['the entries on this disk', { entriesOnDisk: 2 }],
  ])('rejects an archive split across files (%s)', async (_, trailer) => {
    const bytes = craftZip({
      entries: [{ name: 'a', data: JSON_BYTES }],
      trailer,
    });
    await expect(open(bytes)).rejects.toThrow(/split across/);
  });

  it('rejects an archive whose directory starts on another disk', async () => {
    const bytes = craftZip({ entries: [] });
    new DataView(bytes.buffer).setUint16(bytes.length - 22 + 6, 1, true);
    await expect(open(bytes)).rejects.toThrow(/split across/);
  });

  it.each([-1, 1])(
    'rejects a directory the trailer misplaces by %i',
    async (shift) => {
      const bytes = craftZip({ entries: [{ name: 'a', data: JSON_BYTES }] });
      const view = new DataView(bytes.buffer);
      const at = bytes.length - 22 + 16;
      view.setUint32(at, view.getUint32(at, true) + shift, true);
      await expect(open(bytes)).rejects.toThrow(/not where the trailer says/);
    },
  );

  it('rejects a self-extracting stub in front of the entries', async () => {
    const bytes = craftZip({
      entries: [{ name: 'a', data: JSON_BYTES }],
      prefix: new Uint8Array(64),
      trailer: { directoryOffset: 0 },
    });
    await expect(open(bytes)).rejects.toThrow(/not where the trailer says/);
  });

  it('rejects a directory record with the wrong signature', async () => {
    const bytes = craftZip({
      entries: [{ name: 'a', data: JSON_BYTES, central: { signature: 1 } }],
    });
    await expect(open(bytes)).rejects.toThrow(/malformed central directory/);
  });

  it('rejects a trailer that counts more records than the directory holds', async () => {
    const bytes = craftZip({
      entries: [{ name: 'a', data: JSON_BYTES }],
      trailer: { entryCount: 2 },
    });
    await expect(open(bytes)).rejects.toThrow(/runs past its end/);
  });

  it('rejects a directory holding a record the trailer does not count', async () => {
    const bytes = craftZip({
      entries: [
        { name: 'a', data: JSON_BYTES },
        { name: 'b', data: JSON_BYTES },
      ],
      trailer: { entryCount: 1 },
    });
    await expect(open(bytes)).rejects.toThrow(/more than its entries/);
  });

  it('rejects a record whose name, extra field and comment run past the directory', async () => {
    const bytes = craftZip({
      entries: [{ name: 'a', data: JSON_BYTES, comment: 'xyz' }],
    });
    const directoryAt = bytes.length - 22 - (46 + 1 + 3);
    new DataView(bytes.buffer).setUint16(directoryAt + 32, 4, true);
    await expect(open(bytes)).rejects.toThrow(/runs past its end/);
  });

  it('rejects an encrypted entry', async () => {
    const bytes = craftZip({
      entries: [{ name: 'a', data: JSON_BYTES, central: { flags: 0x0801 } }],
    });
    await expect(open(bytes)).rejects.toThrow(/"a" is encrypted/);
  });

  it('rejects a compression method other than store and deflate', async () => {
    const bytes = craftZip({
      entries: [{ name: 'a', data: JSON_BYTES, central: { method: 12 } }],
    });
    await expect(open(bytes)).rejects.toThrow(/compression method 12/);
  });

  it('rejects a stored entry whose two sizes disagree', async () => {
    const bytes = craftZip({
      entries: [
        { name: 'a', data: JSON_BYTES, method: 'store', central: { size: 1 } },
      ],
    });
    await expect(open(bytes)).rejects.toThrow(/two different sizes/);
  });

  it('rejects two entries of the same name, of which a lookup could see either', async () => {
    const bytes = craftZip({
      entries: [
        { name: 'a', data: JSON_BYTES },
        { name: 'a', data: encoder.encode('other') },
      ],
    });
    await expect(open(bytes)).rejects.toThrow(/"a" appears twice/);
  });

  // Records pointing at one region would each cost a copy of it.
  it('rejects records that point into the same bytes', async () => {
    const photo = new Uint8Array(1000).fill(1);
    const bytes = craftZip({
      entries: [
        { name: 'a', data: photo, method: 'store' },
        {
          name: 'b',
          data: photo,
          method: 'store',
          central: { localOffset: 0 },
        },
      ],
    });
    await expect(open(bytes)).rejects.toThrow(/overlaps what follows it/);
  });

  it('rejects an entry whose data would run into the directory', async () => {
    const bytes = craftZip({
      entries: [
        { name: 'a', data: JSON_BYTES, method: 'store' },
        { name: 'b', data: JSON_BYTES, method: 'store' },
      ],
    });
    const recordB = bytes.length - 22 - 47;
    const view = new DataView(bytes.buffer);
    view.setUint32(recordB + 20, JSON_BYTES.length + 1, true);
    view.setUint32(recordB + 24, JSON_BYTES.length + 1, true);
    await expect(open(bytes)).rejects.toThrow(/"b" overlaps what follows it/);
  });

  it('reads a record that ends exactly where the directory does', async () => {
    const entries = await readAll(
      craftZip({ entries: [{ name: '', data: JSON_BYTES }] }),
    );
    expect(entries.get('')).toEqual(JSON_BYTES);
  });

  it('reads entries that touch, the last one ending on the directory', async () => {
    const entries = await readAll(
      craftZip({
        entries: [
          { name: 'a', data: encoder.encode('1'), method: 'store' },
          { name: 'b', data: encoder.encode('2'), method: 'store' },
        ],
      }),
    );
    expect(entries.size).toBe(2);
  });
});

describe('reading an entry the directory lists', () => {
  it('rejects a local header without its signature', async () => {
    await expect(
      readOne([{ name: 'a', data: JSON_BYTES, local: { signature: 1 } }]),
    ).rejects.toThrow(/"a" has a local header the directory contradicts/);
  });

  it('rejects a local header naming another compression method', async () => {
    await expect(
      readOne([{ name: 'a', data: JSON_BYTES, local: { method: 0 } }]),
    ).rejects.toThrow(/local header the directory contradicts/);
  });

  it.each(['ac', 'abc'])(
    'rejects a local header naming another entry (%s)',
    async (localName) => {
      await expect(
        readOne([
          {
            name: 'ab',
            data: JSON_BYTES,
            method: 'store',
            local: { name: localName },
          },
          { name: 'z', data: JSON_BYTES, method: 'store' },
        ]),
      ).rejects.toThrow(/local header the directory contradicts/);
    },
  );

  it('rejects a local extra field that pushes the data past its space', async () => {
    await expect(
      readOne([
        { name: 'a', data: JSON_BYTES, local: { extraLength: 2 } },
        { name: 'b', data: JSON_BYTES },
      ]),
    ).rejects.toThrow(/"a" overlaps what follows it/);
  });

  it.each(['store', 'deflate'] as const)(
    'rejects a %sd entry that fails its checksum',
    async (method) => {
      const failure = readOne([
        { name: 'a', data: JSON_BYTES, method, central: { crc: 1 } },
      ]);
      await expect(failure).rejects.toBeInstanceOf(ZipReadError);
      await expect(failure).rejects.toThrow(/"a" fails its checksum/);
    },
  );

  // A lying size is caught while inflating, whatever the up-front limits let through.
  it('rejects an entry that inflates past its declared size', async () => {
    await expect(
      readOne([{ name: 'a', data: JSON_BYTES, central: { size: 10 } }]),
    ).rejects.toThrow(/"a" inflates past its declared size/);
  });

  it('rejects an entry that inflates short of its declared size', async () => {
    await expect(
      readOne([
        {
          name: 'a',
          data: JSON_BYTES,
          central: { size: JSON_BYTES.length + 1 },
        },
      ]),
    ).rejects.toThrow(/"a" inflates short of its declared size/);
  });

  it('rejects data that is not a deflate stream', async () => {
    await expect(
      readOne([
        { name: 'a', data: JSON_BYTES, payload: new Uint8Array(40).fill(0xff) },
      ]),
    ).rejects.toThrow(/"a" does not inflate/);
  });

  it('reads an empty deflated entry', async () => {
    const read = await readOne([{ name: 'a', data: new Uint8Array() }]);
    expect(read.size).toBe(0);
  });
});

it('names its errors, so a caller can tell them from any other failure', () => {
  expect(new ZipReadError('x').name).toBe('ZipReadError');
  expect(new ZipReadError('x')).toBeInstanceOf(Error);
});
