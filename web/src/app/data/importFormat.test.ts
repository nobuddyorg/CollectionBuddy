import { describe, expect, it } from 'vitest';

import {
  findManifestPath,
  ImportFormatError,
  importPhotoTasks,
  importTimestamps,
  parseManifest,
  rootFolderOf,
} from './importFormat';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION } from './exportFormat';

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_FORMAT_VERSION,
    exported_at: '2026-01-02T03:04:05.000Z',
    category: { id: 'cat-1', name: 'Coins' },
    items: [],
    ...overrides,
  };
}

describe('parseManifest', () => {
  it('accepts a manifest with the current format and version', () => {
    const data = manifest();
    expect(parseManifest(data)).toBe(data);
  });

  it('rejects a file with no format tag at all', () => {
    expect(() => parseManifest({ version: EXPORT_FORMAT_VERSION })).toThrow(
      ImportFormatError,
    );
  });

  it("rejects a file whose format tag isn't this app's", () => {
    expect(() =>
      parseManifest(manifest({ format: 'some-other-export' })),
    ).toThrow(/Not a CollectionBuddy export archive/);
  });

  it('rejects a newer version this build does not understand', () => {
    expect(() =>
      parseManifest(manifest({ version: EXPORT_FORMAT_VERSION + 1 })),
    ).toThrow(/version/);
  });

  it('rejects null', () => {
    expect(() => parseManifest(null)).toThrow(ImportFormatError);
  });

  it('rejects a bare string, not just non-object JSON that happens to crash a naive .format read', () => {
    expect(() => parseManifest('not an object')).toThrow(ImportFormatError);
  });

  it('says every refusal is the archive not being an export', () => {
    expect(() => parseManifest(null)).toThrow(
      expect.objectContaining({ reason: 'not_export' }),
    );
  });

  // ARCH-06: a manifest item without `photos` used to pass here and throw a TypeError after the category was made.
  describe('the fields the import reads', () => {
    const entry = {
      id: 'x',
      title: 'Dime',
      description: null,
      place: 'Bremen',
      place_lat: 53.1,
      place_lng: null,
      tags: ['silver'],
      created_at: '2026-01-02T03:04:05.000Z',
      folder: '001-dime',
      photos: ['photos/001-dime/1.webp'],
    };

    it('accepts entries with every field in shape, null where the export writes null', () => {
      const data = manifest({
        items: [
          entry,
          {
            ...entry,
            description: 'd',
            place: null,
            place_lat: null,
            place_lng: 8.8,
          },
        ],
      });
      expect(parseManifest(data)).toBe(data);
    });

    it.each([
      ['a missing title', { title: undefined }],
      ['a numeric title', { title: 1 }],
      ['a numeric description', { description: 1 }],
      ['a missing description', { description: undefined }],
      ['a numeric place', { place: 5 }],
      ['a textual latitude', { place_lat: '53' }],
      ['a missing longitude', { place_lng: undefined }],
      ['tags that are no list', { tags: 'silver' }],
      ['a tag that is no text', { tags: ['a', 1] }],
      ['no photos', { photos: undefined }],
      ['a photo path that is no text', { photos: [{}] }],
    ])('rejects an entry with %s', (_, change) => {
      const data = manifest({ items: [entry, { ...entry, ...change }] });
      expect(() => parseManifest(data)).toThrow(/malformed entry/);
    });

    it.each([null, 'an entry'])('rejects an entry that is %j', (bad) => {
      expect(() => parseManifest(manifest({ items: [bad] }))).toThrow(
        /malformed entry/,
      );
    });

    it('rejects entries that are no list', () => {
      expect(() => parseManifest(manifest({ items: { 0: entry } }))).toThrow(
        /malformed entry/,
      );
    });

    it.each([
      ['no category', { category: undefined }],
      ['a null category', { category: null }],
      ['a category without a name', { category: { id: 'c' } }],
      ['a numeric name', { category: { name: 7 } }],
    ])('rejects %s', (_, change) => {
      expect(() => parseManifest(manifest(change))).toThrow(
        /names no category/,
      );
    });
  });

  it('names its errors and keeps the reason and the cause', () => {
    const cause = new Error('zip');
    const error = new ImportFormatError('too_large', 'x', { cause });
    expect(error.name).toBe('ImportFormatError');
    expect(error).toBeInstanceOf(Error);
    expect(error.reason).toBe('too_large');
    expect(error.message).toBe('x');
    expect(error.cause).toBe(cause);
  });
});

describe('findManifestPath', () => {
  it('finds the one entry ending in /collection.json', () => {
    const names = [
      'CollectionBuddy-coins-2026-08-06/collection.csv',
      'CollectionBuddy-coins-2026-08-06/collection.json',
      'CollectionBuddy-coins-2026-08-06/photos/001-dime/1.webp',
    ];
    expect(findManifestPath(names)).toBe(
      'CollectionBuddy-coins-2026-08-06/collection.json',
    );
  });

  it('returns null when no entry is a manifest', () => {
    expect(findManifestPath(['a.txt', 'b.txt'])).toBeNull();
  });

  it('takes the name whole, not a file that only ends the same way', () => {
    expect(
      findManifestPath(['root/old-collection.json', 'root/collection.jsonx']),
    ).toBeNull();
  });

  it('returns the first match when more than one entry could be one', () => {
    // A real archive never has two; this pins which one wins rather than leaving it to iteration order.
    expect(
      findManifestPath(['root/sub/collection.json', 'root/collection.json']),
    ).toBe('root/sub/collection.json');
  });
});

describe('rootFolderOf', () => {
  it('strips the trailing /collection.json', () => {
    expect(
      rootFolderOf('CollectionBuddy-coins-2026-08-06/collection.json'),
    ).toBe('CollectionBuddy-coins-2026-08-06');
  });
});

describe('importTimestamps', () => {
  const now = new Date('2026-08-07T12:00:00.000Z');

  it('ends at now, one millisecond apart, oldest first', () => {
    expect(importTimestamps(3, now)).toEqual([
      '2026-08-07T11:59:59.998Z',
      '2026-08-07T11:59:59.999Z',
      '2026-08-07T12:00:00.000Z',
    ]);
  });

  it('gives a single item now itself', () => {
    expect(importTimestamps(1, now)).toEqual(['2026-08-07T12:00:00.000Z']);
  });

  it('has nothing to stamp for no items', () => {
    expect(importTimestamps(0, now)).toEqual([]);
  });
});

describe('importPhotoTasks', () => {
  const now = new Date('2026-08-07T12:00:00.000Z');

  it("stamps each item's photographs oldest first, in manifest order", () => {
    expect(
      importPhotoTasks(
        [
          { id: 'item-1', item: { photos: ['p/1/1.webp', 'p/1/2.jpg'] } },
          { id: 'item-2', item: { photos: [] } },
          { id: 'item-3', item: { photos: ['p/3/1.webp'] } },
        ],
        now,
      ),
    ).toEqual([
      {
        itemId: 'item-1',
        archivePath: 'p/1/1.webp',
        createdAt: '2026-08-07T11:59:59.999Z',
      },
      {
        itemId: 'item-1',
        archivePath: 'p/1/2.jpg',
        createdAt: '2026-08-07T12:00:00.000Z',
      },
      {
        itemId: 'item-3',
        archivePath: 'p/3/1.webp',
        createdAt: '2026-08-07T12:00:00.000Z',
      },
    ]);
  });

  it('has nothing to upload for no items', () => {
    expect(importPhotoTasks([], now)).toEqual([]);
  });

  // SEC-17: one photograph named 200 times would otherwise upload 200 copies into the quota.
  it('uploads a photograph the manifest names more than once only for its first mention', () => {
    expect(
      importPhotoTasks(
        [
          {
            id: 'item-1',
            item: { photos: ['p/1.webp', 'p/1.webp', 'p/2.webp'] },
          },
          { id: 'item-2', item: { photos: ['p/2.webp', 'p/3.webp'] } },
        ],
        now,
      ),
    ).toEqual([
      {
        itemId: 'item-1',
        archivePath: 'p/1.webp',
        createdAt: '2026-08-07T11:59:59.999Z',
      },
      {
        itemId: 'item-1',
        archivePath: 'p/2.webp',
        createdAt: '2026-08-07T12:00:00.000Z',
      },
      {
        itemId: 'item-2',
        archivePath: 'p/3.webp',
        createdAt: '2026-08-07T12:00:00.000Z',
      },
    ]);
  });
});
