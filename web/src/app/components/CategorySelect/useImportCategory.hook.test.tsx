// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { importCategory } from '../../data/importCategory';
import { ImportFormatError } from '../../data/importFormat';
import { readZipEntries } from '../../data/zip';
import { useImportCategory } from './useImportCategory';
import {
  FILE,
  imported,
  installImportMocks,
  wrapper,
} from './useImportCategory.test-support';

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
      expect.objectContaining({ file: FILE, categoryName: 'Coins (2)' }),
    );
    expect(onImported).toHaveBeenCalledWith('cat-9');
    expect(await screen.findByRole('status')).toHaveTextContent(
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

    expect(importCategory).toHaveBeenCalledWith(
      expect.objectContaining({ categoryName: 'Coins' }),
    );
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

  it('says what it is doing while the archive is still being read', async () => {
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

    await waitFor(() =>
      expect(result.current.progress).toEqual({
        phase: 'reading',
        done: 0,
        total: 0,
      }),
    );
    expect(result.current.message).toBe('Reading archive…');
    await act(async () => {
      release?.();
    });
  });

  it('rejects a file that is not one of this app archives', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.mocked(readZipEntries).mockResolvedValue(new Map() as never);
    const { result } = renderHook(() => useImportCategory([]), { wrapper });

    await act(async () => {
      await result.current.runImport(FILE);
    });

    expect(consoleError).toHaveBeenCalledWith(
      'import category',
      expect.objectContaining({
        message: 'Not a CollectionBuddy export archive',
      }),
    );
    consoleError.mockRestore();
    expect(importCategory).not.toHaveBeenCalled();
    // The format complaint, not the generic one: the file was read, it just was not ours.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This file isn't a CollectionBuddy export archive.",
    );
  });

  it('reports an archive whose manifest is not this app format', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.mocked(importCategory).mockRejectedValue(
      new ImportFormatError('Not a CollectionBuddy export archive'),
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
