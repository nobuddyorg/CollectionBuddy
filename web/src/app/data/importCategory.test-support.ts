import { vi, type Mock } from 'vitest';

import type { importCategory } from './importCategory';
import {
  buildManifest,
  exportEntries,
  MANIFEST_NAME,
  type ExportItem,
} from './exportFormat';
import { createZipWriter } from './zip';
import {
  craftZip,
  INFO_ZIP_EXTRA,
  type CraftedEntry,
} from './zipReader.test-support';

type ImportParams = Parameters<typeof importCategory>[0];
type GetUserId = ImportParams['getUserId'];
export type CreateCategoryRow = ImportParams['createCategoryRow'];
export type DeleteCategoryRow = ImportParams['deleteCategoryRow'];
export type CreateItemRows = ImportParams['createItemRows'];
export type UploadImage = ImportParams['uploadImage'];
export type RemoveImages = ImportParams['removeImages'];
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

const PACKED_ROOT = 'CollectionBuddy-coins-2026-08-06';

/** One item and its photograph as a zip tool packs an unzipped export again, under `prefix` ('' for its contents alone), `change` applied to each entry. */
export function buildRepackedArchive({
  photo = new Uint8Array([9, 8, 7, 6]),
  prefix = `${PACKED_ROOT}/`,
  change = (entry) => entry,
}: {
  photo?: Uint8Array;
  prefix?: string;
  change?: (entry: CraftedEntry) => CraftedEntry;
} = {}): Blob {
  const entries = exportEntries(
    [item()],
    new Map([['orig-item-1', ['a.jpg']]]),
  );
  const manifest = buildManifest({
    category: { id: 'orig-cat-1', name: 'Coins' },
    entries,
    exportedAt: new Date('2026-08-06T00:00:00.000Z'),
  });
  // A folder is packed as its own entry first; the contents alone have none.
  const folder: CraftedEntry[] = prefix
    ? [{ name: prefix, data: new Uint8Array(), method: 'store' }]
    : [];
  const packed: CraftedEntry[] = (
    [
      ...folder,
      {
        name: `${prefix}${MANIFEST_NAME}`,
        data: new TextEncoder().encode(JSON.stringify(manifest)),
      },
      {
        name: `${prefix}${entries[0].photos[0].archivePath}`,
        data: photo,
      },
    ] satisfies CraftedEntry[]
  ).map((entry) => ({
    ...entry,
    extra: INFO_ZIP_EXTRA,
    dataDescriptor: true,
  }));
  return new Blob([
    craftZip({ entries: packed.map(change), comment: 're-packed' }),
  ]);
}

export function archiveWithOnePhotoPerEntry(count: number): Promise<Blob> {
  const photosByItemId = Object.fromEntries(
    Array.from({ length: count }, (_, i) => [
      `item-${i}`,
      [new Uint8Array([i])],
    ]),
  );
  const items = Object.keys(photosByItemId).map((id) => item({ id }));
  return buildArchive({ items, photosByItemId });
}

export function fakeGetUserId(userId: string | null): GetUserId {
  return async () => userId;
}

export function fakeCreateCategory(
  id = 'new-cat-1',
): Mock<NonNullable<CreateCategoryRow>> {
  return vi.fn(async (name: string) => ({
    data: { id, name },
    error: null,
  })) as unknown as Mock<NonNullable<CreateCategoryRow>>;
}

export function fakeDeleteCategory(): Mock<NonNullable<DeleteCategoryRow>> {
  return vi.fn(async () => ({ error: null })) as unknown as Mock<
    NonNullable<DeleteCategoryRow>
  >;
}

export function fakeCreateItems(): Mock<NonNullable<CreateItemRows>> {
  return vi.fn(async () => ({ error: null })) as unknown as Mock<
    NonNullable<CreateItemRows>
  >;
}

// Sequential, so each new item's id is predictable: new-item-1, -2, ...
function fakeNewItemId(): () => string {
  let n = 0;
  return () => `new-item-${++n}`;
}

export const NOW = new Date('2026-08-07T12:00:00.000Z');

export function fakeUploadImage(): Mock<NonNullable<UploadImage>> {
  return vi.fn(async () => ({ error: null })) as unknown as Mock<
    NonNullable<UploadImage>
  >;
}

export function fakeRemoveImages(): RemoveImages {
  return vi.fn(async () => ({
    data: [],
    error: null,
  }));
}

export function fakeCreateImage(): Mock<NonNullable<CreateImage>> {
  return vi.fn(async () => ({
    data: { id: 'img-1', item_id: 'item', path_full: 'a', path_thumb: null },
    error: null,
  })) as unknown as Mock<NonNullable<CreateImage>>;
}

export function fakeCompressThumb(): CompressThumb {
  return vi.fn(async () => new Blob(['thumb'], { type: 'image/webp' }));
}

export function baseFakes() {
  return {
    nameCategory: () => 'Coins',
    getUserId: fakeGetUserId('uid'),
    createCategoryRow: fakeCreateCategory(),
    deleteCategoryRow: fakeDeleteCategory(),
    createItemRows: fakeCreateItems(),
    newItemId: fakeNewItemId(),
    now: () => NOW,
    uploadImage: fakeUploadImage(),
    removeImages: fakeRemoveImages(),
    createImage: fakeCreateImage(),
    compressThumb: fakeCompressThumb(),
  };
}
