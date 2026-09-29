import { vi, type Mock } from 'vitest';

import type { exportCategory, ExportResult } from './exportCategory';
import type { ExportItem } from './exportFormat';

export type ListItems = Parameters<typeof exportCategory>[0]['listItems'];
export type SignUrls = Parameters<typeof exportCategory>[0]['signUrls'];

export function item(overrides: Partial<ExportItem> = {}): ExportItem {
  return {
    id: 'item-1',
    title: 'Item',
    description: null,
    place: null,
    place_lat: null,
    place_lng: null,
    tags: [],
    created_at: '2026-01-02T03:04:05.000Z',
    ...overrides,
  };
}

/** A photograph by file name (`size_bytes` null), or by name and the byte size the total-size check reads. */
type PhotoSpec = string | { name: string; size: number };

// Pages a fixed array by cursor as listItemsForExport does: a full page points at its last item and carries its items' photographs.
export function paginatedListItems(
  allItems: ExportItem[],
  photosByItemId: Record<string, PhotoSpec[]> = {},
): ListItems {
  return vi.fn(
    async (page: { after: { itemId: string } | null; size: number }) => {
      const start = page.after
        ? allItems.findIndex((entry) => entry.id === page.after!.itemId) + 1
        : 0;
      const items = allItems.slice(start, start + page.size);
      const next =
        items.length === page.size
          ? { linkedAt: 'at', itemId: items[items.length - 1].id }
          : null;
      // The `uid/itemId/name` path shape a real row carries.
      const photos = items.flatMap(({ id }) =>
        (photosByItemId[id] ?? []).map((spec) => ({
          item_id: id,
          path_full: `uid/${id}/${typeof spec === 'string' ? spec : spec.name}`,
          size_bytes: typeof spec === 'string' ? null : spec.size,
        })),
      );
      return { data: { items, photos, next }, error: null };
    },
  );
}

// Every path signs to a URL derived from itself, so a test can tell which photograph a fetch was for.
export function fakeSignUrls(): Mock<NonNullable<SignUrls>> {
  return vi.fn(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `signed://${path}` })),
    error: null,
  })) as unknown as Mock<NonNullable<SignUrls>>;
}

// One entry with one photograph, filed as '001-item/1.webp'.
export function onePhotoExport() {
  return {
    category: { id: 'cat', name: 'Coins' },
    listItems: paginatedListItems([item({ id: 'item-1' })], {
      'item-1': ['1.webp'],
    }),
    signUrls: fakeSignUrls(),
  };
}

export function okResponse(bytes: number[]): Response {
  return new Response(new Uint8Array(bytes));
}

export function statusResponse(status: number): Response {
  return new Response(null, { status });
}

/** Reads a store-only ZIP back by walking its central directory, independently of the writer. */
export async function readZipEntries(
  blob: Blob,
): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const dataView = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  );
  const trailerAt = bytes.length - 22;
  const entryCount = dataView.getUint16(trailerAt + 8, true);
  let directoryAt = dataView.getUint32(trailerAt + 16, true);

  const entries = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();
  for (let i = 0; i < entryCount; i++) {
    const size = dataView.getUint32(directoryAt + 24, true);
    const nameLength = dataView.getUint16(directoryAt + 28, true);
    const localOffset = dataView.getUint32(directoryAt + 42, true);
    const name = decoder.decode(
      bytes.slice(directoryAt + 46, directoryAt + 46 + nameLength),
    );

    const localNameLength = dataView.getUint16(localOffset + 26, true);
    const dataStart = localOffset + 30 + localNameLength;
    entries.set(name, bytes.slice(dataStart, dataStart + size));

    directoryAt += 46 + nameLength;
  }
  return entries;
}

// Derived from the result's own filename, since most tests here don't control `now`.
export function rootFolderOf(result: ExportResult): string {
  return result.filename.replace(/\.zip$/, '');
}
