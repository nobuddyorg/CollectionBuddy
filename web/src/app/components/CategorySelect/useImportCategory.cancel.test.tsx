// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import {
  ImportCancelledError,
  importCategory,
} from '../../data/importCategory';
import { readZipEntries } from '../../data/zip';
import { useImportCategory } from './useImportCategory';

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

describe('useImportCategory cancel and in-flight guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
    vi.mocked(readZipEntries).mockResolvedValue(archiveHolding(MANIFEST));
    vi.mocked(importCategory).mockResolvedValue(imported());
  });

  it('announces a cancelled import instead of reporting it', async () => {
    vi.mocked(importCategory).mockRejectedValue(new ImportCancelledError());
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    await act(async () => {
      await result.current.runImport(FILE);
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(await screen.findByText('Import cancelled.')).toBeInTheDocument();
  });

  it('can be cancelled when nothing is running, without complaint', () => {
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    expect(() => result.current.cancelImport()).not.toThrow();
  });

  // What the controller ref buys: a cancel captured before the run began still reaches it.
  it('aborts the current run even when cancelled through a reference taken before it started', async () => {
    let signal: AbortSignal | undefined;
    let release: (() => void) | undefined;
    vi.mocked(importCategory).mockImplementation((args) => {
      signal = args.signal;
      return new Promise((resolve) => {
        release = () => resolve(imported());
      });
    });
    const { result } = renderHook(() => useImportCategory([]), { wrapper });
    const cancelFromBefore = result.current.cancelImport;

    act(() => {
      void result.current.runImport(FILE);
    });
    await waitFor(() => expect(signal).toBeDefined());
    act(() => {
      cancelFromBefore();
    });

    expect(signal!.aborted).toBe(true);
    await act(async () => {
      release?.();
    });
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
