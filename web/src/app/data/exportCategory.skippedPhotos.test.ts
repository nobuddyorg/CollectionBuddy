import { describe, expect, it, vi } from 'vitest';

import { exportCategory, type ExportResult } from './exportCategory';
import { MANIFEST_NAME, type ExportManifest } from './exportFormat';
import {
  type SignUrls,
  item,
  fakeGetSession,
  paginatedListItems,
  fakeListImages,
  fakeSignUrls,
  okResponse,
  statusResponse,
  readZipEntries,
  rootFolderOf,
} from './exportCategory.test-support';

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
