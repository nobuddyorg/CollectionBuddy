// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ExportCancelledError } from '../../data/exportCancellation';
import { exportCategory, type ExportProgress } from '../../data/exportCategory';
import { ZipLimitError } from '../../data/zip';
import { ToastConfirmWrapper as wrapper } from '../providers.test-support';
import { downloadBlob } from './downloadBlob';
import { useExportCategory } from './useExportCategory';

vi.mock('../../data/exportCategory', async () => {
  const actual = await vi.importActual<
    typeof import('../../data/exportCategory')
  >('../../data/exportCategory');
  return { ...actual, exportCategory: vi.fn() };
});

vi.mock('./downloadBlob', () => ({ downloadBlob: vi.fn() }));

const CATEGORY = { id: 'cat-1', name: 'Coins' };

function exported(overrides: Record<string, unknown> = {}) {
  return {
    blob: new Blob(['zip']),
    filename: 'CollectionBuddy-coins.zip',
    photoCount: 2,
    skippedPhotoCount: 0,
    ...overrides,
  };
}

type ExportArgs = Parameters<typeof exportCategory>[0];

/** The argument object the hook handed `exportCategory` on its last call. */
function lastCall(): ExportArgs {
  return vi.mocked(exportCategory).mock.calls.at(-1)![0];
}

function holdExport(): () => void {
  let release: (() => void) | undefined;
  vi.mocked(exportCategory).mockImplementation(
    () =>
      new Promise((resolve) => {
        release = () => resolve(exported());
      }) as never,
  );
  return () => release?.();
}

function asksBeforeLargeExport() {
  vi.mocked(exportCategory).mockImplementation((async (args: ExportArgs) => {
    const go = await args.confirmLargeExport!(2.5 * 1024 ** 3);
    if (!go) throw new ExportCancelledError();
    return exported();
  }) as never);
}

function tabCloseIsHeldBack(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

function installExportMocks() {
  vi.clearAllMocks();
  window.localStorage.setItem('lang', 'en');
  vi.mocked(exportCategory).mockResolvedValue(exported() as never);
}

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
    expect(result.current.message).toBeNull();
    // Nothing was left out, so nothing is reported as left out.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('starts on the reading phase, so the button says something before the first page lands', async () => {
    const releaseExport = holdExport();
    const { result } = renderHook(() => useExportCategory(), { wrapper });

    act(() => {
      void result.current.runExport(CATEGORY);
    });

    await waitFor(() =>
      expect(result.current.message).toBe('Reading entries…'),
    );
    expect(result.current.isExporting).toBe(true);

    await act(async () => {
      releaseExport();
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
    asksBeforeLargeExport();
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

  it('reports that size the way the app language writes numbers', async () => {
    window.localStorage.setItem('lang', 'de');
    asksBeforeLargeExport();
    const { result } = renderHook(() => useExportCategory(), { wrapper });

    let done: Promise<void>;
    act(() => {
      done = result.current.runExport(CATEGORY);
    });

    // The matcher collapses the no-break space Intl puts before the unit.
    expect(await screen.findByText(/etwa 2,5 GB/)).toBeInTheDocument();
    await userEvent.click(screen.getByTestId('confirm-accept'));
    await act(async () => {
      await done;
    });

    expect(downloadBlob).toHaveBeenCalled();
  });

  it('treats declining that confirmation as a cancellation, not a failure', async () => {
    asksBeforeLargeExport();
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

  it('reports a rejection that carries no error at all', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.mocked(exportCategory).mockRejectedValue(undefined);
    const { result } = renderHook(() => useExportCategory(), { wrapper });

    await act(async () => {
      await result.current.runExport(CATEGORY);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not export this collection. Please try again.',
    );
    consoleError.mockRestore();
  });
});

describe('useExportCategory cancel and in-flight guards', () => {
  beforeEach(installExportMocks);

  it('ignores a second request while one export is still in flight', async () => {
    const releaseExport = holdExport();
    const { result } = renderHook(() => useExportCategory(), { wrapper });

    act(() => {
      void result.current.runExport(CATEGORY);
    });
    await waitFor(() => expect(result.current.isExporting).toBe(true));

    await act(async () => {
      await result.current.runExport(CATEGORY);
    });

    expect(exportCategory).toHaveBeenCalledTimes(1);
    await act(async () => {
      releaseExport();
    });
  });

  it('cancels the export actually in flight', async () => {
    const releaseExport = holdExport();
    const { result } = renderHook(() => useExportCategory(), { wrapper });

    act(() => {
      void result.current.runExport(CATEGORY);
    });
    await waitFor(() => expect(result.current.isExporting).toBe(true));
    expect(lastCall().signal!.aborted).toBe(false);

    act(() => {
      result.current.cancelExport();
    });

    expect(lastCall().signal!.aborted).toBe(true);
    await act(async () => {
      releaseExport();
    });
  });

  // Nothing is in flight, so there is no controller to abort; it must not throw either.
  it('does nothing when asked to cancel with no export running', () => {
    const { result } = renderHook(() => useExportCategory(), { wrapper });

    expect(() => {
      act(() => {
        result.current.cancelExport();
      });
    }).not.toThrow();
  });

  it('drops the controller once a run has finished, so a later cancel is a no-op', async () => {
    const { result } = renderHook(() => useExportCategory(), { wrapper });
    await act(async () => {
      await result.current.runExport(CATEGORY);
    });

    act(() => {
      result.current.cancelExport();
    });

    expect(lastCall().signal!.aborted).toBe(false);
  });

  // Closing the tab mid-run would discard minutes of work, so the browser asks, but only then.
  it('guards against closing the tab only while an export is running', async () => {
    const releaseExport = holdExport();
    const { result } = renderHook(() => useExportCategory(), { wrapper });
    expect(tabCloseIsHeldBack()).toBe(false);

    act(() => {
      void result.current.runExport(CATEGORY);
    });
    await waitFor(() => expect(result.current.isExporting).toBe(true));
    expect(tabCloseIsHeldBack()).toBe(true);

    await act(async () => {
      releaseExport();
    });
    expect(tabCloseIsHeldBack()).toBe(false);
  });
});
