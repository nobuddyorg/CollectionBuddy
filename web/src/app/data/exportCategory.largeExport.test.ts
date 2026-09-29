import { afterEach, describe, expect, it, vi } from 'vitest';

import { ExportCancelledError } from './exportCancellation';
import { exportCategory, LARGE_EXPORT_WARN_BYTES } from './exportCategory';
import {
  item,
  paginatedListItems,
  fakeSignUrls,
  okResponse,
} from './exportCategory.test-support';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('confirmLargeExport', () => {
  it('does not ask when the total stays under the threshold', async () => {
    const confirmLargeExport = vi.fn().mockResolvedValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    const result = await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      listItems: paginatedListItems([item({ id: 'a' })], {
        a: [{ name: '1.webp', size: 1024 }],
      }),
      signUrls: fakeSignUrls(),
      confirmLargeExport,
    });
    expect(confirmLargeExport).not.toHaveBeenCalled();
    expect(result.photoCount).toBe(1);
  });

  // The check is a `>`: a total sitting exactly on the threshold is not a large export.
  it('does not ask for a total sitting exactly on the threshold', async () => {
    const confirmLargeExport = vi.fn().mockResolvedValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    const result = await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      listItems: paginatedListItems([item({ id: 'a' })], {
        a: [{ name: '1.webp', size: LARGE_EXPORT_WARN_BYTES }],
      }),
      signUrls: fakeSignUrls(),
      confirmLargeExport,
    });
    expect(confirmLargeExport).not.toHaveBeenCalled();
    expect(result.photoCount).toBe(1);
  });

  it('asks, with the total bytes, once the threshold is exceeded, and proceeds when accepted', async () => {
    const bigSize = LARGE_EXPORT_WARN_BYTES + 1;
    const confirmLargeExport = vi.fn().mockResolvedValue(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    const result = await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      listItems: paginatedListItems([item({ id: 'a' })], {
        a: [{ name: '1.webp', size: bigSize }],
      }),
      signUrls: fakeSignUrls(),
      confirmLargeExport,
    });
    expect(confirmLargeExport).toHaveBeenCalledWith(bigSize);
    expect(result.photoCount).toBe(1);
  });

  it('cancels the export, before downloading anything, when the warning is declined', async () => {
    const bigSize = LARGE_EXPORT_WARN_BYTES + 1;
    const confirmLargeExport = vi.fn().mockResolvedValue(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const failure = exportCategory({
      category: { id: 'cat', name: 'Coins' },
      listItems: paginatedListItems([item({ id: 'a' })], {
        a: [{ name: '1.webp', size: bigSize }],
      }),
      signUrls: fakeSignUrls(),
      confirmLargeExport,
    });
    await expect(failure).rejects.toBeInstanceOf(ExportCancelledError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('proceeds unprompted when no confirmLargeExport is supplied at all', async () => {
    const bigSize = LARGE_EXPORT_WARN_BYTES + 1;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    const result = await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      listItems: paginatedListItems([item({ id: 'a' })], {
        a: [{ name: '1.webp', size: bigSize }],
      }),
      signUrls: fakeSignUrls(),
    });
    expect(result.photoCount).toBe(1);
  });

  it('sums sizes across every item', async () => {
    const confirmLargeExport = vi.fn().mockResolvedValue(true);
    const half = LARGE_EXPORT_WARN_BYTES / 2 + 1;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse([1])),
    );
    await exportCategory({
      category: { id: 'cat', name: 'Coins' },
      listItems: paginatedListItems([item({ id: 'a' }), item({ id: 'b' })], {
        a: [{ name: '1.webp', size: half }],
        b: [{ name: '1.webp', size: half }],
      }),
      signUrls: fakeSignUrls(),
      confirmLargeExport,
    });
    expect(confirmLargeExport).toHaveBeenCalledWith(2 * half);
  });
});
