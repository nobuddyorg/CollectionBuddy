// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ExportCancelledError,
  exportCategory,
  type ExportProgress,
} from '../../data/exportCategory';
import { ZipLimitError } from '../../data/zip';
import { downloadBlob } from './downloadBlob';
import { useExportCategory } from './useExportCategory';
import {
  CATEGORY,
  type ExportArgs,
  exported,
  installExportMocks,
  lastCall,
  wrapper,
} from './useExportCategory.test-support';

vi.mock('../../data/exportCategory', async () => {
  const actual = await vi.importActual<
    typeof import('../../data/exportCategory')
  >('../../data/exportCategory');
  return { ...actual, exportCategory: vi.fn() };
});

vi.mock('./downloadBlob', () => ({ downloadBlob: vi.fn() }));

describe('useExportCategory', () => {
  beforeEach(installExportMocks);

  it('exports the named category and hands the archive to the browser', async () => {
    const { result } = renderHook(() => useExportCategory(), { wrapper });

    await act(async () => {
      await result.current.runExport(CATEGORY);
    });

    expect(lastCall().category).toEqual(CATEGORY);
    expect(downloadBlob).toHaveBeenCalledWith(
      expect.any(Blob),
      'CollectionBuddy-coins.zip',
    );
    expect(result.current.isExporting).toBe(false);
    expect(result.current.progress).toBeNull();
    // Nothing was left out, so nothing is reported as left out.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('starts on the reading phase, so the button says something before the first page lands', async () => {
    let release: (() => void) | undefined;
    vi.mocked(exportCategory).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(exported());
        }) as never,
    );
    const { result } = renderHook(() => useExportCategory(), { wrapper });

    act(() => {
      void result.current.runExport(CATEGORY);
    });

    await waitFor(() =>
      expect(result.current.progress).toEqual({
        phase: 'items',
        done: 0,
        total: 0,
      }),
    );
    expect(result.current.isExporting).toBe(true);
    expect(result.current.message).toBe('Reading entries…');

    await act(async () => {
      release?.();
    });
    expect(result.current.isExporting).toBe(false);
  });

  it('shows whatever phase the export reports as it advances', async () => {
    let report: ((progress: ExportProgress) => void) | undefined;
    let release: (() => void) | undefined;
    vi.mocked(exportCategory).mockImplementation(((args: ExportArgs) => {
      report = args.onProgress;
      return new Promise((resolve) => {
        release = () => resolve(exported());
      });
    }) as never);
    const { result } = renderHook(() => useExportCategory(), { wrapper });

    act(() => {
      void result.current.runExport(CATEGORY);
    });
    await waitFor(() => expect(report).toBeDefined());

    act(() => {
      report!({ phase: 'photos', done: 1, total: 4 });
    });

    expect(result.current.message).toBe('Photographs 1 of 4…');
    await act(async () => {
      release?.();
    });
  });

  it('asks before exporting an archive big enough to lose, and reports the size', async () => {
    vi.mocked(exportCategory).mockImplementation((async (args: ExportArgs) => {
      const go = await args.confirmLargeExport!(2.5 * 1024 ** 3);
      if (!go) throw new ExportCancelledError();
      return exported();
    }) as never);
    const { result } = renderHook(() => useExportCategory(), { wrapper });

    let done: Promise<void>;
    act(() => {
      done = result.current.runExport(CATEGORY);
    });

    expect(await screen.findByText(/about 2\.5 GB/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('confirm-accept'));
    await act(async () => {
      await done;
    });

    expect(downloadBlob).toHaveBeenCalled();
  });

  it('treats declining that confirmation as a cancellation, not a failure', async () => {
    vi.mocked(exportCategory).mockImplementation((async (args: ExportArgs) => {
      const go = await args.confirmLargeExport!(2.5 * 1024 ** 3);
      if (!go) throw new ExportCancelledError();
      return exported();
    }) as never);
    const { result } = renderHook(() => useExportCategory(), { wrapper });

    let done: Promise<void>;
    act(() => {
      done = result.current.runExport(CATEGORY);
    });
    await userEvent.click(await screen.findByTestId('confirm-cancel'));
    await act(async () => {
      await done;
    });

    expect(downloadBlob).not.toHaveBeenCalled();
    // Announced, not alerted: the visitor asked for this outcome.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(
      'Export cancelled.',
    );
  });

  // Export-then-delete is a canonical use, so a photograph missing from the archive is never left unsaid.
  it('reports photographs the export had to skip', async () => {
    vi.mocked(exportCategory).mockResolvedValue(
      exported({ photoCount: 2, skippedPhotoCount: 1 }) as never,
    );
    const { result } = renderHook(() => useExportCategory(), { wrapper });

    await act(async () => {
      await result.current.runExport(CATEGORY);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '1 of 3 photographs could not be included in the export.',
    );
    // The archive is still worth having, so it is still downloaded.
    expect(downloadBlob).toHaveBeenCalled();
  });

  it('reports entries whose photographs could not even be listed', async () => {
    vi.mocked(exportCategory).mockResolvedValue(
      exported({ skippedItemCount: 4 }) as never,
    );
    const { result } = renderHook(() => useExportCategory(), { wrapper });

    await act(async () => {
      await result.current.runExport(CATEGORY);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "4 entries' photographs could not be listed and are missing from the export.",
    );
  });

  it('says an archive that cannot fit is too large, not that it should be retried', async () => {
    vi.mocked(exportCategory).mockRejectedValue(
      new ZipLimitError('too many bytes'),
    );
    const { result } = renderHook(() => useExportCategory(), { wrapper });

    await act(async () => {
      await result.current.runExport(CATEGORY);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This collection is too large to export as one archive.',
    );
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(result.current.isExporting).toBe(false);
  });

  it('reports any other failure, with the cause on the console', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const boom = new Error('network gone');
    vi.mocked(exportCategory).mockRejectedValue(boom);
    const { result } = renderHook(() => useExportCategory(), { wrapper });

    await act(async () => {
      await result.current.runExport(CATEGORY);
    });

    expect(consoleError).toHaveBeenCalledWith('export category', boom);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not export this collection. Please try again.',
    );
    expect(result.current.isExporting).toBe(false);
    consoleError.mockRestore();
  });
});
