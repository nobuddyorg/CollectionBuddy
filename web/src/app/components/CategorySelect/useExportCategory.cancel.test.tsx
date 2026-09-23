// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { exportCategory } from '../../data/exportCategory';
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

describe('useExportCategory cancel and in-flight guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
    vi.mocked(exportCategory).mockResolvedValue(exported() as never);
  });

  // A second click while one export is running must not start a second run.
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
