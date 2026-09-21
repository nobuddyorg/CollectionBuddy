// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import {
  ExportCancelledError,
  exportCategory,
  type ExportProgress,
} from '../../data/exportCategory';
import { ZipLimitError } from '../../data/zip';
import { downloadBlob } from './downloadBlob';
import { useExportCategory } from './useExportCategory';

vi.mock('../../data/exportCategory', async () => {
  const actual = await vi.importActual<
    typeof import('../../data/exportCategory')
  >('../../data/exportCategory');
  return { ...actual, exportCategory: vi.fn() };
});

vi.mock('./downloadBlob', () => ({ downloadBlob: vi.fn() }));

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

const CATEGORY = { id: 'cat-1', name: 'Coins' };

function exported(overrides: Record<string, unknown> = {}) {
  return {
    blob: new Blob(['zip']),
    filename: 'CollectionBuddy-coins.zip',
    photoCount: 2,
    skippedPhotoCount: 0,
    skippedItemCount: 0,
    ...overrides,
  };
}

type ExportArgs = Parameters<typeof exportCategory>[0];

/** The argument object the hook handed `exportCategory` on its last call. */
function lastCall(): ExportArgs {
  return vi.mocked(exportCategory).mock.calls.at(-1)![0];
}

describe('useExportCategory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
    vi.mocked(exportCategory).mockResolvedValue(exported() as never);
  });

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
    let report: ((p: ExportProgress) => void) | undefined;
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

  // A second click while one export is already running must not start a
  // second run against the same category.
  it('ignores a second request while one export is still in flight', async () => {
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
    await waitFor(() => expect(result.current.isExporting).toBe(true));

    await act(async () => {
      await result.current.runExport(CATEGORY);
    });

    expect(exportCategory).toHaveBeenCalledTimes(1);
    await act(async () => {
      release?.();
    });
  });

  it('cancels the export actually in flight', async () => {
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
    await waitFor(() => expect(result.current.isExporting).toBe(true));
    expect(lastCall().signal!.aborted).toBe(false);

    act(() => {
      result.current.cancelExport();
    });

    expect(lastCall().signal!.aborted).toBe(true);
    await act(async () => {
      release?.();
    });
  });

  // Nothing is in flight, so there is no controller to abort -- it must not
  // throw either.
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

  // Export-then-delete is a canonical use of this feature, so a photograph
  // missing from the archive can never be left unsaid.
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

  // An export runs for minutes; closing the tab mid-run would discard it
  // with no way back, so the browser has to ask first -- but only while
  // there is something to lose.
  it('guards against closing the tab only while an export is running', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    let release: (() => void) | undefined;
    vi.mocked(exportCategory).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(exported());
        }) as never,
    );
    const { result } = renderHook(() => useExportCategory(), { wrapper });

    const beforeUnloadCalls = () =>
      addSpy.mock.calls.filter(([event]) => event === 'beforeunload');
    // Nothing to lose yet, so nothing is listening yet.
    expect(beforeUnloadCalls()).toHaveLength(0);

    act(() => {
      void result.current.runExport(CATEGORY);
    });
    await waitFor(() => expect(result.current.isExporting).toBe(true));

    expect(beforeUnloadCalls()).toHaveLength(1);
    const handler = beforeUnloadCalls()[0][1] as EventListener;
    const event = new Event('beforeunload', { cancelable: true });
    handler(event);
    expect(event.defaultPrevented).toBe(true);

    await act(async () => {
      release?.();
    });

    expect(removeSpy).toHaveBeenCalledWith('beforeunload', handler);
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });
});
