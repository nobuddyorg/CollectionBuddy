import { describe, expect, it, vi } from 'vitest';

import { exportCategory, type ExportResult } from './exportCategory';
import {
  MANIFEST_NAME,
  type ExportItem,
  type ExportManifest,
} from './exportFormat';
import type { supabase } from '../supabase';

type GetSession = () => ReturnType<typeof supabase.auth.getSession>;
type ListItems = Parameters<typeof exportCategory>[0]['listItems'];
type ListImages = Parameters<typeof exportCategory>[0]['listImages'];
type SignUrls = Parameters<typeof exportCategory>[0]['signUrls'];

function item(overrides: Partial<ExportItem> = {}): ExportItem {
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

// Only `data.session.user.id` is ever read, so that's all the fake carries.
function fakeGetSession(uid: string | null): GetSession {
  return (async () => ({
    data: { session: uid ? { user: { id: uid } } : null },
  })) as unknown as GetSession;
}

// Pages a fixed array by cursor as listItemsForExport does: a full page points at its last item.
function paginatedListItems(allItems: ExportItem[]): ListItems {
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
      return { data: { items, next }, error: null };
    },
  );
}

// Keyed by item id, building the `uid/itemId/name` path shape a real row carries; `size_bytes` null.
function fakeListImages(byItemId: Record<string, string[]>): ListImages {
  return async (itemIds: string[]) => ({
    data: itemIds.flatMap((itemId) =>
      (byItemId[itemId] ?? []).map((name) => ({
        item_id: itemId,
        path_full: `uid/${itemId}/${name}`,
        size_bytes: null,
      })),
    ),
    error: null,
  });
}

// Every path signs to a URL derived from itself, so a test can tell which photograph a fetch was for.
function fakeSignUrls(): SignUrls {
  return (async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `signed://${path}` })),
    error: null,
  })) as unknown as SignUrls;
}

function okResponse(bytes: number[]): Response {
  return new Response(new Uint8Array(bytes));
}

function statusResponse(status: number): Response {
  return new Response(null, { status });
}

/** Reads a store-only ZIP back by walking its central directory, independently of the writer. */
async function readZipEntries(blob: Blob): Promise<Map<string, Uint8Array>> {
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
function rootFolderOf(result: ExportResult): string {
  return result.filename.replace(/\.zip$/, '');
}

async function manifestOf(result: ExportResult): Promise<ExportManifest> {
  const entries = await readZipEntries(result.blob);
  const bytes = entries.get(`${rootFolderOf(result)}/${MANIFEST_NAME}`);
  if (!bytes) throw new Error('collection.json missing from archive');
  return JSON.parse(new TextDecoder().decode(bytes)) as ExportManifest;
}

describe('exportCategory, a photograph that cannot be fetched', () => {
  it('is left out of the archive but still named in the manifest, and the export still resolves', async () => {
    let permanentFailureCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        // A 404 is permanent, so this resolves without needing fake timers.
        if (url === 'signed://uid/item-1/2.webp') {
          permanentFailureCalls++;
          return statusResponse(404);
        }
        return okResponse([1, 2, 3]);
      }),
    );
    try {
      const result = await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'item-1' })]),
        listImages: fakeListImages({
          'item-1': ['1.webp', '2.webp'],
        }),
        signUrls: fakeSignUrls(),
      });

      expect(result.skippedPhotoCount).toBe(1);
      expect(result.photoCount).toBe(1);
      expect(permanentFailureCalls).toBe(1);

      const entries = await readZipEntries(result.blob);
      const root = rootFolderOf(result);
      expect(entries.has(`${root}/photos/001-item/1.webp`)).toBe(true);
      expect(entries.get(`${root}/photos/001-item/1.webp`)).toEqual(
        new Uint8Array([1, 2, 3]),
      );
      expect(entries.has(`${root}/photos/001-item/2.webp`)).toBe(false);

      // The manifest still names the photograph the archive is missing.
      const manifest = await manifestOf(result);
      expect(manifest.items[0].photos).toEqual([
        'photos/001-item/1.webp',
        'photos/001-item/2.webp',
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('skips a photograph whose signing came back with no usable URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    const signUrls = (async (paths: string[]) => ({
      data: paths.map((path, i) =>
        i === 0
          ? { path, signedUrl: null }
          : { path, signedUrl: `signed://${path}` },
      ),
      error: null,
    })) as unknown as SignUrls;
    try {
      const result = await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'item-1' })]),
        listImages: fakeListImages({
          'item-1': ['1.webp', '2.webp'],
        }),
        signUrls,
      });

      expect(result.skippedPhotoCount).toBe(1);
      expect(result.photoCount).toBe(1);
      const entries = await readZipEntries(result.blob);
      const root = rootFolderOf(result);
      expect(entries.has(`${root}/photos/001-item/1.webp`)).toBe(false);
      expect(entries.has(`${root}/photos/001-item/2.webp`)).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('logs which photograph it skipped and why', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => statusResponse(404)),
    );
    try {
      await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'item-1' })]),
        listImages: fakeListImages({ 'item-1': ['1.webp'] }),
        signUrls: fakeSignUrls(),
      });
      expect(consoleError).toHaveBeenCalledWith(
        'Skipping photograph',
        'uid/item-1/1.webp',
        expect.anything(),
      );
      const [, , error] = consoleError.mock.calls[0] as unknown[];
      expect(String(error)).toContain('HTTP 404');
    } finally {
      consoleError.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it('names the bucket in the error for a photograph with no signed URL at all', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const signUrls = (async () => ({
      data: [],
      error: null,
    })) as unknown as SignUrls;
    try {
      await exportCategory({
        category: { id: 'cat', name: 'Coins' },
        getSession: fakeGetSession('uid'),
        listItems: paginatedListItems([item({ id: 'item-1' })]),
        listImages: fakeListImages({ 'item-1': ['1.webp'] }),
        signUrls,
      });
      const [, , error] = consoleError.mock.calls[0] as unknown[];
      expect(String(error)).toContain('Unsigned path in');
    } finally {
      consoleError.mockRestore();
    }
  });
});
