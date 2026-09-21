import { describe, expect, it, vi } from 'vitest';

import { importCategory } from './importCategory';
import { WEBP_COMPRESSION_OPTIONS } from '../lib/imageCompression';
import {
  buildManifest,
  exportEntries,
  MANIFEST_NAME,
  type ExportItem,
} from './exportFormat';
import { createZipWriter } from './zip';

// Every other test in importCategory.test.ts injects its own thumbnailer,
// which leaves the default -- the one real browser call this module makes --
// never executed. This file exercises that default and nothing else.
const compress = vi.fn(async () => new Blob(['thumb']));
vi.mock('browser-image-compression', () => ({
  default: (...args: unknown[]) => compress(...(args as [])),
}));

const PHOTO = new Uint8Array([1, 2, 3]);

function itemRow(): ExportItem {
  return {
    id: 'orig-item-1',
    title: 'Seated Dime',
    description: null,
    place: null,
    place_lat: null,
    place_lng: null,
    tags: [],
    created_at: '2026-01-02T03:04:05.000Z',
  };
}

async function archiveWithOnePhoto(): Promise<Blob> {
  const entries = exportEntries(
    [itemRow()],
    new Map([['orig-item-1', ['orig-item-1/0.webp']]]),
  );
  const manifest = buildManifest({
    category: { id: 'orig-cat-1', name: 'Coins' },
    entries,
    exportedAt: new Date('2026-08-06T00:00:00.000Z'),
  });
  const writer = createZipWriter();
  const root = 'CollectionBuddy-coins-2026-08-06';
  writer.add(
    `${root}/${MANIFEST_NAME}`,
    new TextEncoder().encode(JSON.stringify(manifest)),
  );
  writer.add(`${root}/${entries[0].photos[0].archivePath}`, PHOTO);
  return writer.finish();
}

describe('importCategory with no thumbnailer injected', () => {
  it('makes the thumbnail with the app own compression settings', async () => {
    const result = await importCategory({
      file: await archiveWithOnePhoto(),
      categoryName: 'Coins',
      getUid: async () => 'uid',
      createCategoryRow: (async () => ({
        data: { id: 'cat-1', name: 'Coins' },
        error: null,
      })) as never,
      deleteCategoryRow: (async () => ({ error: null })) as never,
      createItemRow: (async () => ({
        data: { id: 'item-1' },
        error: null,
      })) as never,
      linkItemToCategoryRow: (async () => ({ error: null })) as never,
      uploadImage: (async () => ({ error: null })) as never,
      createImage: (async () => ({
        data: { id: 'img-1' },
        error: null,
      })) as never,
    });

    expect(result.photoCount).toBe(1);
    expect(compress).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        maxWidthOrHeight: 600,
        ...WEBP_COMPRESSION_OPTIONS,
      }),
    );
    // The archive only ever carries the full-size image, so the thumbnail
    // is made from the bytes that are actually in it.
    const [file] = compress.mock.calls[0] as unknown as [File];
    expect(file.type).toBe('image/webp');
    expect(file.name).toBe('photo.webp');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(PHOTO);
  });
});
