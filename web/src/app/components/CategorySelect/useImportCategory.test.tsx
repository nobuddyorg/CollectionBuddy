// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import {
  ImportCancelledError,
  importCategory,
} from '../../data/importCategory';
import { ImportFormatError } from '../../data/importFormat';
import { readZipEntries } from '../../data/zip';
import { importProgressMessage, useImportCategory } from './useImportCategory';

vi.mock('../../data/importCategory', async () => {
  const actual = await vi.importActual<
    typeof import('../../data/importCategory')
  >('../../data/importCategory');
  return { ...actual, importCategory: vi.fn() };
});

vi.mock('../../data/zip', async () => {
  const actual =
    await vi.importActual<typeof import('../../data/zip')>('../../data/zip');
  return { ...actual, readZipEntries: vi.fn() };
});

const MANIFEST = {
  format: 'collectionbuddy-category-export',
  version: 1,
  category: { id: 'orig', name: 'Coins' },
  exportedAt: '2026-08-06T00:00:00.000Z',
  items: [],
};

function archiveHolding(manifest: unknown) {
  return new Map([
    [
      'CollectionBuddy-coins/collection.json',
      new TextEncoder().encode(JSON.stringify(manifest)),
    ],
  ]);
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

function imported(overrides: Record<string, unknown> = {}) {
  return {
    category: { id: 'cat-9', name: 'Coins (2)', user_id: 'owner-1' },
    itemCount: 1,
    photoCount: 1,
    skippedPhotoCount: 0,
    ...overrides,
  };
}

const FILE = new File(['zip'], 'coins.zip');

describe('importProgressMessage', () => {
  const t = ((key: string) =>
    ({
      'category_select.import_reading': 'Reading the archive…',
      'category_select.import_items': 'Creating entries…',
      'category_select.import_photos': 'Photos {done} of {total}…',
    })[key] ?? key) as Parameters<typeof importProgressMessage>[1];

  it('says nothing when no import is running', () => {
    expect(importProgressMessage(null, t)).toBeNull();
  });

  it('counts photographs once there are any to count', () => {
    expect(
      importProgressMessage({ phase: 'photos', done: 2, total: 5 }, t),
    ).toBe('Photos 2 of 5…');
  });

  // "0 of 0" would be a progress bar for work that does not exist.
  it('falls back to the entries wording for a photo phase with nothing to do', () => {
    expect(
      importProgressMessage({ phase: 'photos', done: 0, total: 0 }, t),
    ).toBe('Creating entries…');
  });

  it('names the reading and entry phases', () => {
    expect(
      importProgressMessage({ phase: 'reading', done: 0, total: 0 }, t),
    ).toBe('Reading the archive…');
    expect(
      importProgressMessage({ phase: 'items', done: 1, total: 3 }, t),
    ).toBe('Creating entries…');
  });
});

describe('useImportCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
    vi.mocked(readZipEntries).mockResolvedValue(archiveHolding(MANIFEST));
    vi.mocked(importCategory).mockResolvedValue(imported());
  });

  it('names the new category apart from the ones already there', async () => {
    const onImported = vi.fn();
    const { result } = renderHook(() => useImportCategory(['Coins']), {
      wrapper,
    });

    await act(async () => {
      await result.current.runImport(FILE, onImported);
    });

    expect(importCategory).toHaveBeenCalledWith(
      expect.objectContaining({ file: FILE, categoryName: 'Coins (2)' }),
    );
    expect(onImported).toHaveBeenCalledWith('cat-9');
    expect(await screen.findByRole('status')).toHaveTextContent('Coins (2)');
    expect(result.current.isImporting).toBe(false);
  });

  it('keeps the archive name when nothing else has it', async () => {
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    await act(async () => {
      await result.current.runImport(FILE);
    });

    expect(importCategory).toHaveBeenCalledWith(
      expect.objectContaining({ categoryName: 'Coins' }),
    );
  });

  // A photograph left behind must never go missing quietly: the canonical
  // use of an export is "export, then delete the originals".
  it('reports photographs the import had to leave out', async () => {
    vi.mocked(importCategory).mockResolvedValue(
      imported({ photoCount: 2, skippedPhotoCount: 1 }),
    );
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    await act(async () => {
      await result.current.runImport(FILE);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('1');
  });

  it('rejects a file that is not one of this app archives', async () => {
    vi.mocked(readZipEntries).mockResolvedValue(new Map() as never);
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    await act(async () => {
      await result.current.runImport(FILE);
    });

    expect(importCategory).not.toHaveBeenCalled();
    expect(await screen.findByRole('alert')).toBeVisible();
  });

  it('reports an archive whose manifest is not this app format', async () => {
    vi.mocked(importCategory).mockRejectedValue(
      new ImportFormatError('Not a CollectionBuddy export archive'),
    );
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    await act(async () => {
      await result.current.runImport(FILE);
    });

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(result.current.isImporting).toBe(false);
  });

  it('reports any other failure as an import error', async () => {
    vi.mocked(importCategory).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    await act(async () => {
      await result.current.runImport(FILE);
    });

    expect(await screen.findByRole('alert')).toBeVisible();
  });

  it('announces a cancelled import instead of reporting it', async () => {
    vi.mocked(importCategory).mockRejectedValue(new ImportCancelledError());
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    await act(async () => {
      await result.current.runImport(FILE);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('aborts the run in flight when cancelled', async () => {
    let signal: AbortSignal | undefined;
    let release: (() => void) | undefined;
    vi.mocked(importCategory).mockImplementation((args) => {
      signal = args.signal;
      return new Promise((resolve) => {
        release = () => resolve(imported());
      });
    });
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    act(() => {
      void result.current.runImport(FILE);
    });
    await waitFor(() => expect(signal).toBeDefined());
    act(() => result.current.cancelImport());

    expect(signal?.aborted).toBe(true);
    await act(async () => {
      release?.();
    });
  });

  it('refuses to start a second import while one is running', async () => {
    let release: (() => void) | undefined;
    vi.mocked(importCategory).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(imported());
        }),
    );
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    act(() => {
      void result.current.runImport(FILE);
    });
    await waitFor(() => expect(result.current.isImporting).toBe(true));
    await act(async () => {
      await result.current.runImport(FILE);
    });

    expect(importCategory).toHaveBeenCalledTimes(1);
    await act(async () => {
      release?.();
    });
  });

  // Closing the tab mid-import would leave a half-built category behind.
  it('warns before the tab is closed while an import is running', async () => {
    let release: (() => void) | undefined;
    vi.mocked(importCategory).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(imported());
        }),
    );
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    act(() => {
      void result.current.runImport(FILE);
    });
    await waitFor(() => expect(result.current.isImporting).toBe(true));

    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    await act(async () => {
      release?.();
    });
    const afterwards = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(afterwards);
    expect(afterwards.defaultPrevented).toBe(false);
  });
});
