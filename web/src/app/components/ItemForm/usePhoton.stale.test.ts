// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePhotonSearch } from './usePhoton';
import type { PhotonFeature } from './types';

function feature(
  osm_id: number,
  partial: Partial<PhotonFeature['properties']> = {},
): PhotonFeature {
  return {
    properties: {
      osm_id,
      osm_type: 'N',
      osm_key: 'place',
      osm_value: 'city',
      ...partial,
    },
    geometry: { type: 'Point', coordinates: [0, 0] },
  };
}

/** A fetch response settled by the test, plus whether it honours its abort signal. */
function deferredResponse() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const response = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  const abortable = (_url: string, options: { signal: AbortSignal }) => {
    options.signal.addEventListener('abort', () => {
      reject(new DOMException('Aborted', 'AbortError'));
    });
    return response;
  };
  return { response, resolve, reject, abortable };
}

async function searchFor(
  result: { current: ReturnType<typeof usePhotonSearch> },
  query: string,
) {
  act(() => {
    result.current.setFocus(true);
    result.current.setQuery(query);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}

describe('usePhotonSearch superseded requests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // A slower first request superseded by a second must not report its own abort as a failure.
  it('does not treat a request aborted by a newer search as a failure', async () => {
    const first = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(first.abortable)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ features: [feature(1, { city: 'Cologne' })] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePhotonSearch('en'));
    await searchFor(result, 'Col');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);

    // A second, distinct query re-fires the debounce, aborting the first request's controller.
    await searchFor(result, 'Colo');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.results).toHaveLength(1);
  });

  // Only a request that ignores its abort and settles late can reach the guard with a stale controller.
  it('keeps loading true while a genuinely in-flight newer request is unaffected by an earlier one settling late', async () => {
    const first = deferredResponse();
    const secondResponse = new Promise(() => {});
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => first.response)
      .mockImplementationOnce(() => secondResponse);
    vi.stubGlobal('fetch', fetchMock);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { result } = renderHook(() => usePhotonSearch('en'));
    await searchFor(result, 'Col');
    await searchFor(result, 'Colo');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(true);
    expect(result.current.searched).toBe(false);

    await act(async () => {
      first.reject(new Error('a slow, stale request finally gives up'));
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.searched).toBe(false);
    expect(result.current.error).toBe(false);
    consoleError.mockRestore();
  });

  // The effect's own cleanup aborts what is in flight without starting a replacement to own the state.
  it('does not show an error when the in-flight request is cancelled by blurring, not by a newer search', async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn().mockImplementationOnce(pending.abortable);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePhotonSearch('en'));
    await searchFor(result, 'Col');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Blurring flips `focus` false; the search effect's cleanup aborts the fetch without a new controller.
    await act(async () => {
      result.current.setFocus(false);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.error).toBe(false);
  });

  // Real fetches reject once aborted; the guard exists for a slower response that still lands anyway.
  it('ignores a slower first response that resolves successfully after a newer search has already taken over', async () => {
    const first = deferredResponse();
    const second = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => first.response)
      .mockImplementationOnce(() => second.response);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePhotonSearch('en'));
    await searchFor(result, 'Col');
    await searchFor(result, 'Colo');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve({
        ok: true,
        json: async () => ({ features: [feature(2, { city: 'Colmar' })] }),
      });
    });
    expect(result.current.results).toEqual([feature(2, { city: 'Colmar' })]);
    expect(result.current.loading).toBe(false);

    // The stale first request must not overwrite the results, reopen `loading`, or mark `searched` again.
    await act(async () => {
      first.resolve({
        ok: true,
        json: async () => ({ features: [feature(1, { city: 'Cologne' })] }),
      });
    });
    expect(result.current.results).toEqual([feature(2, { city: 'Colmar' })]);
    expect(result.current.loading).toBe(false);
  });

  // The staleness guard in the catch block: a late non-abort failure must not clobber a newer success.
  it('ignores a stale, genuinely-failed response that lands after a newer search already succeeded', async () => {
    const first = deferredResponse();
    const second = deferredResponse();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => first.response)
      .mockImplementationOnce(() => second.response);
    vi.stubGlobal('fetch', fetchMock);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { result } = renderHook(() => usePhotonSearch('en'));
    await searchFor(result, 'Col');
    await searchFor(result, 'Colo');

    await act(async () => {
      second.resolve({
        ok: true,
        json: async () => ({ features: [feature(2, { city: 'Colmar' })] }),
      });
    });
    expect(result.current.results).toEqual([feature(2, { city: 'Colmar' })]);
    expect(result.current.error).toBe(false);

    await act(async () => {
      first.reject(new Error('stale network failure'));
    });

    expect(result.current.results).toEqual([feature(2, { city: 'Colmar' })]);
    expect(result.current.error).toBe(false);
    consoleError.mockRestore();
  });
});
