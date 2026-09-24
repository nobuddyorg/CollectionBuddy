import { describe, expect, it } from 'vitest';

import {
  buildManifest,
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  exportEntries,
  PHOTOS_DIR,
} from './exportFormat';
import { item } from './exportFormat.test-support';

describe('exportEntries', () => {
  it('numbers each folder and each photograph inside it', () => {
    const entries = exportEntries(
      [item({ id: 'a', title: 'Seated Dime' })],
      new Map([['a', ['uid/a/one.webp', 'uid/a/two.webp']]]),
    );
    expect(entries[0].folder).toBe('001-seated-dime');
    expect(entries[0].photos).toEqual([
      {
        storagePath: 'uid/a/one.webp',
        archivePath: `${PHOTOS_DIR}/001-seated-dime/1.webp`,
      },
      {
        storagePath: 'uid/a/two.webp',
        archivePath: `${PHOTOS_DIR}/001-seated-dime/2.webp`,
      },
    ]);
  });

  it('pairs each photograph with the exact storage path it came from', () => {
    const entries = exportEntries(
      [item({ id: 'a' })],
      new Map([['a', ['uid/a/one.webp', 'uid/a/two.webp']]]),
    );
    expect(entries[0].photos.map((photo) => photo.storagePath)).toEqual([
      'uid/a/one.webp',
      'uid/a/two.webp',
    ]);
  });

  it('keeps two items of the same title in folders of their own', () => {
    const entries = exportEntries(
      [item({ id: 'a', title: 'Coin' }), item({ id: 'b', title: 'Coin' })],
      new Map([
        ['a', ['uid/a/x.webp']],
        ['b', ['uid/b/y.webp']],
      ]),
    );
    expect(entries[0].folder).not.toBe(entries[1].folder);
    expect(entries.map((entry) => entry.folder)).toEqual([
      '001-coin',
      '002-coin',
    ]);
    expect(entries[0].photos[0].archivePath).not.toBe(
      entries[1].photos[0].archivePath,
    );
  });

  it('gives an item with no photographs an empty list, not a missing one', () => {
    const entries = exportEntries([item({ id: 'a' })], new Map());
    expect(entries[0].photos).toEqual([]);
    expect(entries[0].folder).toBe('001-seated-dime');
  });

  it('carries the item through untouched', () => {
    const original = item({ id: 'a', tags: ['silver'] });
    expect(exportEntries([original], new Map())[0].item).toEqual(original);
  });

  it('takes each photograph’s extension from the object it came from', () => {
    const entries = exportEntries(
      [item({ id: 'a', title: 'Coin' })],
      new Map([['a', ['uid/a/x.jpeg']]]),
    );
    expect(entries[0].photos).toEqual([
      {
        storagePath: 'uid/a/x.jpeg',
        archivePath: `${PHOTOS_DIR}/001-coin/1.jpeg`,
      },
    ]);
  });
});

describe('buildManifest', () => {
  const exportedAt = new Date('2026-08-06T10:20:30.000Z');

  it('states its own format and version, so an importer can check them', () => {
    const manifest = buildManifest({
      category: { id: 'c1', name: 'Coins' },
      entries: [],
      exportedAt,
    });
    // Spelled out, not only compared to the constant: a future importer keys off this exact string.
    expect(manifest.format).toBe('collectionbuddy-category-export');
    expect(manifest.format).toBe(EXPORT_FORMAT);
    expect(manifest.version).toBe(1);
    expect(manifest.version).toBe(EXPORT_FORMAT_VERSION);
    expect(manifest.exported_at).toBe('2026-08-06T10:20:30.000Z');
    expect(manifest.category).toEqual({ id: 'c1', name: 'Coins' });
    expect(manifest.items).toEqual([]);
  });

  it('keeps every field at full fidelity, unlike the CSV beside it', () => {
    const entries = exportEntries(
      [
        item({
          id: 'a',
          description: 'A note',
          place: 'Cologne',
          place_lat: 50.9,
          place_lng: 6.9,
          tags: ['silver', 'us'],
        }),
      ],
      new Map([['a', ['uid/a/x.webp']]]),
    );
    const [row] = buildManifest({
      category: { id: 'c1', name: 'Coins' },
      entries,
      exportedAt,
    }).items;

    expect(row.place_lat).toBe(50.9);
    expect(row.tags).toEqual(['silver', 'us']);
    expect(row.id).toBe('a');
    expect(row.folder).toBe('001-seated-dime');
    expect(row.photos).toEqual([`${PHOTOS_DIR}/001-seated-dime/1.webp`]);
  });

  it('keeps an absent field absent rather than emptying it', () => {
    const entries = exportEntries([item({ id: 'a' })], new Map());
    const [row] = buildManifest({
      category: { id: 'c1', name: 'Coins' },
      entries,
      exportedAt,
    }).items;
    expect(row.description).toBeNull();
    expect(row.place_lat).toBeNull();
  });

  it('survives the round trip through JSON it is written as', () => {
    const manifest = buildManifest({
      category: { id: 'c1', name: 'Münzen' },
      entries: exportEntries([item({ id: 'a' })], new Map()),
      exportedAt,
    });
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });
});
