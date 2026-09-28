// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CutoutProgress } from '../../lib/coinCutout';

const preloadCoinModel = vi.hoisted(() => vi.fn());
vi.mock('./load', () => ({
  loadCoinCutout: async () => ({ preloadCoinModel }),
}));

// Module state: each test loads a fresh copy, as a fresh page would.
async function freshPreload() {
  vi.resetModules();
  return import('./coinModelPreload');
}

beforeEach(() => {
  preloadCoinModel.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('coin model preload', () => {
  it('is idle until someone asks for it', async () => {
    const { usePreloadState } = await freshPreload();

    const { result } = renderHook(() => usePreloadState());

    expect(result.current).toEqual({ status: 'idle' });
    expect(preloadCoinModel).not.toHaveBeenCalled();
  });

  it('reports download progress, then ready', async () => {
    let report: (progress: CutoutProgress) => void = () => {};
    let finish: () => void = () => {};
    preloadCoinModel.mockImplementation(
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
    await vi.waitFor(() => expect(preloadCoinModel).toHaveBeenCalled());

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
    preloadCoinModel.mockResolvedValue(undefined);
    const { preloadModel } = await freshPreload();

    await Promise.all([preloadModel(), preloadModel()]);
    await preloadModel();

    expect(preloadCoinModel).toHaveBeenCalledOnce();
  });

  it('reports a failed download, logs it, and lets it be tried again', async () => {
    const error = new Error('HTTP 404');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    preloadCoinModel
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce(undefined);
    const { preloadModel, usePreloadState } = await freshPreload();
    const { result } = renderHook(() => usePreloadState());

    await act(() => preloadModel());
    expect(result.current).toEqual({ status: 'failed' });
    expect(log).toHaveBeenCalledWith('Coin model download failed', error);

    await act(() => preloadModel());
    expect(result.current).toEqual({ status: 'ready' });
  });

  it('stops listening once its reader unmounts', async () => {
    const { usePreloadState } = await freshPreload();
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => usePreloadState());

    unmount();

    expect(remove).toHaveBeenCalledWith(
      'collectionbuddy:coin-model',
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
});
