// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CutoutProgress } from '../../lib/backgroundRemoval';

const { preloadSegmentationModel, isSegmentationModelCached } = vi.hoisted(
  () => ({
    preloadSegmentationModel: vi.fn(),
    isSegmentationModelCached: vi.fn(),
  }),
);
vi.mock('./load', () => ({
  loadBackgroundRemoval: async () => ({
    preloadSegmentationModel,
    isSegmentationModelCached,
  }),
}));

// Module state: each test loads a fresh copy, as a fresh page would.
async function freshPreload() {
  vi.resetModules();
  return import('./modelPreload');
}

beforeEach(() => {
  preloadSegmentationModel.mockReset();
  isSegmentationModelCached.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('model preload', () => {
  it('is idle until someone asks for it', async () => {
    const { usePreloadState } = await freshPreload();

    const { result } = renderHook(() => usePreloadState());

    expect(result.current).toEqual({ status: 'idle' });
    expect(preloadSegmentationModel).not.toHaveBeenCalled();
  });

  it('reports download progress, then ready', async () => {
    let report: (progress: CutoutProgress) => void = () => {};
    let finish: () => void = () => {};
    preloadSegmentationModel.mockImplementation(
      ({ onProgress }: { onProgress: typeof report }) => {
        report = onProgress;
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
    );
    const { preloadModel, usePreloadState } = await freshPreload();
    const { result } = renderHook(() => usePreloadState());

    let done: Promise<void> = Promise.resolve();
    act(() => {
      done = preloadModel();
    });
    expect(result.current).toEqual({
      status: 'downloading',
      loaded: 0,
      total: 0,
    });
    await vi.waitFor(() => expect(preloadSegmentationModel).toHaveBeenCalled());

    act(() => report({ stage: 'download', loaded: 30, total: 90 }));
    expect(result.current).toEqual({
      status: 'downloading',
      loaded: 30,
      total: 90,
    });

    act(() => report({ stage: 'analyze' }));
    expect(result.current).toEqual({
      status: 'downloading',
      loaded: 30,
      total: 90,
    });

    await act(async () => {
      finish();
      await done;
    });
    expect(result.current).toEqual({ status: 'ready' });
  });

  it('starts one download however often it is asked', async () => {
    preloadSegmentationModel.mockResolvedValue(undefined);
    const { preloadModel } = await freshPreload();

    await Promise.all([preloadModel(), preloadModel()]);
    await preloadModel();

    expect(preloadSegmentationModel).toHaveBeenCalledOnce();
  });

  it('reports a failed download, logs it, and lets it be tried again', async () => {
    const error = new Error('HTTP 404');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    preloadSegmentationModel
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined);
    const { preloadModel, usePreloadState } = await freshPreload();
    const { result } = renderHook(() => usePreloadState());

    await act(() => preloadModel());
    expect(result.current).toEqual({ status: 'failed' });
    expect(log).toHaveBeenCalledWith(
      'Segmentation model download failed',
      error,
    );

    await act(() => preloadModel());
    expect(result.current).toEqual({ status: 'ready' });
  });

  it('stops listening once its reader unmounts', async () => {
    const { usePreloadState } = await freshPreload();
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => usePreloadState());

    unmount();

    expect(remove).toHaveBeenCalledWith(
      'collectionbuddy:segmentation-model',
      expect.any(Function),
    );
  });

  it('renders idle on the server', async () => {
    const { usePreloadState } = await freshPreload();
    function Probe() {
      return <span>{usePreloadState().status}</span>;
    }

    expect(renderToString(<Probe />)).toContain('idle');
  });

  describe('a model cached before this page loaded', () => {
    it('reads as ready without downloading it again', async () => {
      isSegmentationModelCached.mockResolvedValue(true);
      const { detectCachedModel, usePreloadState } = await freshPreload();
      const { result } = renderHook(() => usePreloadState());

      await act(() => detectCachedModel());

      expect(result.current).toEqual({ status: 'ready' });
      expect(preloadSegmentationModel).not.toHaveBeenCalled();
    });

    it('leaves the download to be offered when nothing is cached', async () => {
      isSegmentationModelCached.mockResolvedValue(false);
      const { detectCachedModel, usePreloadState } = await freshPreload();
      const { result } = renderHook(() => usePreloadState());

      await act(() => detectCachedModel());

      expect(result.current).toEqual({ status: 'idle' });
    });

    it('turns a failed download ready once a cut-out has cached the model', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      preloadSegmentationModel.mockRejectedValue(new Error('offline'));
      isSegmentationModelCached.mockResolvedValue(true);
      const { detectCachedModel, preloadModel, usePreloadState } =
        await freshPreload();
      const { result } = renderHook(() => usePreloadState());
      await act(() => preloadModel());

      await act(() => detectCachedModel());

      expect(result.current).toEqual({ status: 'ready' });
    });

    it('does not look while a download runs, nor once the model is ready', async () => {
      let finish: () => void = () => {};
      preloadSegmentationModel.mockReturnValue(
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
      );
      const { detectCachedModel, preloadModel } = await freshPreload();
      const done = preloadModel();

      await detectCachedModel();
      await vi.waitFor(() =>
        expect(preloadSegmentationModel).toHaveBeenCalled(),
      );
      finish();
      await done;
      await detectCachedModel();

      expect(isSegmentationModelCached).not.toHaveBeenCalled();
    });

    it('logs a check that fails and keeps offering the download', async () => {
      const error = new Error('chunk failed to load');
      const log = vi.spyOn(console, 'error').mockImplementation(() => {});
      isSegmentationModelCached.mockRejectedValue(error);
      const { detectCachedModel, usePreloadState } = await freshPreload();
      const { result } = renderHook(() => usePreloadState());

      await act(() => detectCachedModel());

      expect(result.current).toEqual({ status: 'idle' });
      expect(log).toHaveBeenCalledWith(
        'Could not check for a cached segmentation model',
        error,
      );
    });
  });
});
