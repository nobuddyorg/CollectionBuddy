// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ImportCancelledError } from '../../data/importCancellation';
import { importCategory } from '../../data/importCategory';
import { ImportFormatError } from '../../data/importFormat';
import { leavingIsHeld } from '../../lib/useBeforeUnloadGuard.test-support';
import { ToastWrapper as wrapper } from '../providers.test-support';
import { useImportCategory } from './useImportCategory';

vi.mock('../../data/importCategory', async () => {
  const actual = await vi.importActual<
    typeof import('../../data/importCategory')
  >('../../data/importCategory');
  return { ...actual, importCategory: vi.fn() };
});

function imported(overrides: Record<string, unknown> = {}) {
  return {
    category: { id: 'cat-9', name: 'Coins (2)', user_id: 'owner-1' },
    itemCount: 1,
    photoCount: 1,
    skippedPhotoCount: 0,
    photoQuotaReached: 'none' as const,
    ...overrides,
  };
}

const FILE = new File(['zip'], 'coins.zip');

// The name the hook would give the category importCategory reads out of the archive.
function namedFromArchive(archivedName: string): string {
  const [[{ nameCategory }]] = vi.mocked(importCategory).mock.calls;
  return nameCategory(archivedName);
}

function holdImport(): {
  release: () => void;
  signal: () => AbortSignal | undefined;
} {
  let signal: AbortSignal | undefined;
  let release: (() => void) | undefined;
  vi.mocked(importCategory).mockImplementation((args) => {
    signal = args.signal;
    return new Promise((resolve) => {
      release = () => resolve(imported());
    });
  });
  return { release: () => release?.(), signal: () => signal };
}

// An import of one item with one photograph.
function installImportMocks() {
  vi.clearAllMocks();
  window.localStorage.setItem('lang', 'en');
  vi.mocked(importCategory).mockResolvedValue(imported());
}

describe('useImportCategory', () => {
  beforeEach(installImportMocks);

  it('names the new category apart from the ones already there', async () => {
    const onImported = vi.fn();
    const { result } = renderHook(() => useImportCategory(['Coins']), {
      wrapper,
    });

    await act(async () => {
      await result.current.runImport(FILE, onImported);
    });

    expect(importCategory).toHaveBeenCalledWith(
      expect.objectContaining({ file: FILE }),
    );
    expect(namedFromArchive('Coins')).toBe('Coins (2)');
    expect(onImported).toHaveBeenCalledWith('cat-9');
    expect(await screen.findByTestId('toast')).toHaveTextContent(
      'Imported as "Coins (2)".',
    );
    // Nothing was skipped, so nothing is reported as skipped.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(result.current.isImporting).toBe(false);
  });

  it('keeps the archive name when nothing else has it', async () => {
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    await act(async () => {
      await result.current.runImport(FILE);
    });

    expect(namedFromArchive('Coins')).toBe('Coins');
  });

  // Export-then-delete is the canonical use, so a photograph left behind must never go unsaid.
  it('reports photographs the import had to leave out', async () => {
    vi.mocked(importCategory).mockResolvedValue(
      imported({ photoCount: 2, skippedPhotoCount: 1 }),
    );
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    await act(async () => {
      await result.current.runImport(FILE);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '1 of 3 photographs could not be imported.',
    );
  });

  it('says the photo quota stopped the import, so the rest are not taken for errors', async () => {
    vi.mocked(importCategory).mockResolvedValue(
      imported({
        photoCount: 5,
        skippedPhotoCount: 15,
        photoQuotaReached: 'owner',
      }),
    );
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    await act(async () => {
      await result.current.runImport(FILE);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '15 of 20 photographs were not imported: the limit of 256 MiB of photographs is reached.',
    );
  });

  it('says what it is doing while the archive is still being read', async () => {
    const held = holdImport();
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    act(() => {
      void result.current.runImport(FILE);
    });

    await waitFor(() =>
      expect(result.current.message).toBe('Reading archive…'),
    );
    await act(async () => {
      held.release();
    });
  });

  it('reports an archive whose manifest is not this app format', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.mocked(importCategory).mockRejectedValue(
      new ImportFormatError({
        reason: 'not_export',
        message: 'Not a CollectionBuddy export archive',
      }),
    );
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    await act(async () => {
      await result.current.runImport(FILE);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This file isn't a CollectionBuddy export archive.",
    );
    expect(consoleError).toHaveBeenCalledWith(
      'import category',
      expect.any(ImportFormatError),
    );
    expect(result.current.isImporting).toBe(false);
    consoleError.mockRestore();
  });

  // A damaged or oversized archive fails the same way every time, so the message says why, not "try again".
  it.each([
    [
      'unreadable',
      'This archive is damaged, or uses a ZIP feature the import cannot read, such as encryption. Import the .zip the export downloaded.',
    ],
    [
      'too_large',
      'This archive unpacks to more than an import accepts, so nothing was imported.',
    ],
  ] as const)(
    'says why an archive that is %s cannot be imported',
    async (reason, message) => {
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      vi.mocked(importCategory).mockRejectedValue(
        new ImportFormatError({ reason, message: 'refused' }),
      );
      const { result } = renderHook(() => useImportCategory([]), { wrapper });

      await act(async () => {
        await result.current.runImport(FILE);
      });

      expect(await screen.findByRole('alert')).toHaveTextContent(message);
      expect(result.current.isImporting).toBe(false);
      consoleError.mockRestore();
    },
  );

  it('says the entry limit would be passed when the import is refused for its quota', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.mocked(importCategory).mockRejectedValue(
      new Error('Could not create items', {
        cause: { code: 'PT507', message: 'entry quota of 50000 reached' },
      }),
    );
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    await act(async () => {
      await result.current.runImport(FILE);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Importing this archive would pass the limit of 50,000 entries.',
    );
    consoleError.mockRestore();
  });

  it('reports any other failure as an import error', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.mocked(importCategory).mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    await act(async () => {
      await result.current.runImport(FILE);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not import this archive. Please try again.',
    );
    expect(consoleError).toHaveBeenCalledWith(
      'import category',
      expect.any(Error),
    );
    consoleError.mockRestore();
  });
});

describe('useImportCategory cancel and in-flight guards', () => {
  beforeEach(installImportMocks);

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
    const held = holdImport();
    const { result } = renderHook(() => useImportCategory([]), { wrapper });
    const cancelFromBefore = result.current.cancelImport;

    act(() => {
      void result.current.runImport(FILE);
    });
    await waitFor(() => expect(held.signal()).toBeDefined());
    act(() => {
      cancelFromBefore();
    });

    expect(held.signal()?.aborted).toBe(true);
    await act(async () => {
      held.release();
    });
  });

  it('aborts the run in flight when cancelled', async () => {
    const held = holdImport();
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    act(() => {
      void result.current.runImport(FILE);
    });
    await waitFor(() => expect(held.signal()).toBeDefined());
    act(() => result.current.cancelImport());

    expect(held.signal()?.aborted).toBe(true);
    await act(async () => {
      held.release();
    });
  });

  it('refuses to start a second import while one is running', async () => {
    const held = holdImport();
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
      held.release();
    });
  });

  // Closing the tab mid-import would leave a half-built category behind.
  it('warns before the tab is closed while an import is running', async () => {
    const held = holdImport();
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    act(() => {
      void result.current.runImport(FILE);
    });
    await waitFor(() => expect(result.current.isImporting).toBe(true));

    expect(leavingIsHeld()).toBe(true);

    await act(async () => {
      held.release();
    });
    expect(leavingIsHeld()).toBe(false);
  });
});
