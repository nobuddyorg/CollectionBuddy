import { describe, expect, it } from 'vitest';

import {
  findManifestPath,
  ImportFormatError,
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

  it('names its errors, so a caller can tell them from any other failure', () => {
    expect(new ImportFormatError('x').name).toBe('ImportFormatError');
    expect(new ImportFormatError('x')).toBeInstanceOf(Error);
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

  it('returns the first match when more than one entry could be one', () => {
    // A real archive never has two -- this pins the behavior rather than
    // leaving "which one wins" as an accident of iteration order.
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
