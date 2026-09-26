import { vi } from 'vitest';

import type { importCategory } from './importCategory';
import {
  buildManifest,
  exportEntries,
  MANIFEST_NAME,
  type ExportItem,
} from './exportFormat';
import { createZipWriter } from './zip';

type ImportParams = Parameters<typeof importCategory>[0];
type GetUid = ImportParams['getUid'];
export type CreateCategoryRow = ImportParams['createCategoryRow'];
export type DeleteCategoryRow = ImportParams['deleteCategoryRow'];
export type CreateItemRows = ImportParams['createItemRows'];
export type LinkItemRows = ImportParams['linkItemRows'];
export type DeleteItemRows = ImportParams['deleteItemRows'];
export type UploadImage = ImportParams['uploadImage'];
export type CreateImage = ImportParams['createImage'];
export type CompressThumb = ImportParams['compressThumb'];

export function item(overrides: Partial<ExportItem> = {}): ExportItem {
  return {
    id: 'orig-item-1',
    title: 'Seated Dime',
    description: null,
    place: null,
    place_lat: null,
    place_lng: null,
    tags: [],
    created_at: '2026-01-02T03:04:05.000Z',
    ...overrides,
  };
}

/** A real archive built the way exportCategory.ts does, so the import reads the actual format. */
export async function buildArchive({
  items = [item()],
  photosByItemId = { 'orig-item-1': [new Uint8Array([1, 2, 3])] },
  root = 'CollectionBuddy-coins-2026-08-06',
}: {
  items?: ExportItem[];
  photosByItemId?: Record<string, Uint8Array<ArrayBuffer>[]>;
  root?: string;
} = {}): Promise<Blob> {
  const photoPathsByItemId = new Map(
    Object.entries(photosByItemId).map(([id, photos]) => [
      id,
      photos.map((_, i) => `${id}/${i}.webp`),
    ]),
  );
  const entries = exportEntries(items, photoPathsByItemId);
  const manifest = buildManifest({
    category: { id: 'orig-cat-1', name: 'Coins' },
    entries,
    exportedAt: new Date('2026-08-06T00:00:00.000Z'),
  });

  const writer = createZipWriter();
  const encoder = new TextEncoder();
  writer.add({
    path: `${root}/${MANIFEST_NAME}`,
    bytes: encoder.encode(JSON.stringify(manifest)),
  });
  for (const entry of entries) {
    for (const photo of entry.photos) {
      const [itemId, indexText] = photo.storagePath.split('/');
      const bytes =
        photosByItemId[itemId][Number(indexText.replace('.webp', ''))];
      writer.add({ path: `${root}/${photo.archivePath}`, bytes });
    }
  }
  return writer.finish();
}

export function fakeGetUid(uid: string | null): GetUid {
  return async () => uid;
}

export function fakeCreateCategory(id = 'new-cat-1'): CreateCategoryRow {
  return vi.fn(async (name: string) => ({
    data: { id, name },
    error: null,
  })) as unknown as CreateCategoryRow;
}

export function fakeDeleteCategory(): DeleteCategoryRow {
  return vi.fn(async () => ({ error: null })) as unknown as DeleteCategoryRow;
}

export function fakeCreateItems(): CreateItemRows {
  return vi.fn(async () => ({ error: null })) as unknown as CreateItemRows;
}

export function fakeLinkItems(): LinkItemRows {
  return vi.fn(async () => ({ error: null })) as unknown as LinkItemRows;
}

export function fakeDeleteItems(): DeleteItemRows {
  return vi.fn(async () => ({ error: null })) as unknown as DeleteItemRows;
}

// Sequential, so each new item's id is predictable: new-item-1, -2, ...
function fakeNewItemId(): () => string {
  let n = 0;
  return () => `new-item-${++n}`;
}

export const NOW = new Date('2026-08-07T12:00:00.000Z');

export function fakeUploadImage(): UploadImage {
  return vi.fn(async () => ({ error: null })) as unknown as UploadImage;
}

export function fakeCreateImage(): CreateImage {
  return vi.fn(async () => ({
    data: { id: 'img-1', item_id: 'item', path_full: 'a', path_thumb: null },
    error: null,
  })) as unknown as CreateImage;
}

export function fakeCompressThumb(): CompressThumb {
  return vi.fn(async () => new Blob(['thumb'], { type: 'image/webp' }));
}

export function baseFakes() {
  return {
    getUid: fakeGetUid('uid'),
    createCategoryRow: fakeCreateCategory(),
    deleteCategoryRow: fakeDeleteCategory(),
    createItemRows: fakeCreateItems(),
    linkItemRows: fakeLinkItems(),
    deleteItemRows: fakeDeleteItems(),
    newItemId: fakeNewItemId(),
    now: () => NOW,
    uploadImage: fakeUploadImage(),
    createImage: fakeCreateImage(),
    compressThumb: fakeCompressThumb(),
  };
}
