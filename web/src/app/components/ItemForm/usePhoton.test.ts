// @vitest-environment jsdom
import { act, render, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  dedupePhotonFeatures,
  formatPlaceDisplay,
  isQueryLongEnough,
  usePhotonSearch,
} from './usePhoton';
import type { PhotonFeature, PlaceChoice } from './types';

function props(
  partial: Partial<PhotonFeature['properties']> = {},
): PhotonFeature['properties'] {
  return {
    osm_id: 1,
    osm_type: 'N',
    osm_key: 'place',
    osm_value: 'city',
    ...partial,
  };
}

function feature(
  osm_id: number,
  partial: Partial<PhotonFeature['properties']> = {},
): PhotonFeature {
  return {
    properties: props({ osm_id, ...partial }),
    geometry: { type: 'Point', coordinates: [0, 0] },
  };
}

describe('formatPlaceDisplay', () => {
  it('prefers city, falling back through town/village/municipality/name', () => {
    expect(formatPlaceDisplay(props({ town: 'Smallville' }), null).city).toBe(
      'Smallville',
    );
    expect(
      formatPlaceDisplay(props({ city: 'Cologne', town: 'ignored' }), null)
        .city,
    ).toBe('Cologne');
  });

  it('joins state and country for the second line', () => {
    const { line2 } = formatPlaceDisplay(
      props({ state: 'NRW', country: 'Germany' }),
      null,
    );
    expect(line2).toBe('NRW, Germany');
  });

  it('omits a missing state or country instead of leaving a stray separator', () => {
    expect(formatPlaceDisplay(props({ country: 'Germany' }), null).line2).toBe(
      'Germany',
    );
    expect(formatPlaceDisplay(props({ state: 'NRW' }), null).line2).toBe('NRW');
  });

  it('falls back to an empty city when no name field is present at all', () => {
    expect(formatPlaceDisplay(props(), null).city).toBe('');
  });

  it('does not look up a region name when regionNames is unavailable, even with a countrycode', () => {
    expect(() =>
      formatPlaceDisplay(props({ countrycode: 'de' }), null),
    ).not.toThrow();
    expect(formatPlaceDisplay(props({ countrycode: 'de' }), null).line2).toBe(
      '',
    );
  });

  it('lowercases the dedupe key', () => {
    expect(formatPlaceDisplay(props({ city: 'COLOGNE' }), null).key).toBe(
      'cologne|||',
    );
  });

  it('collapses a run of whitespace to one separator, so it cannot merge two distinct names', () => {
    const collapsed = formatPlaceDisplay(props({ city: 'A\t\tB' }), null);
    const singleSpace = formatPlaceDisplay(props({ city: 'A B' }), null);
    expect(collapsed.key).toBe(singleSpace.key);

    const twoWords = formatPlaceDisplay(props({ city: 'New York' }), null);
    const oneWord = formatPlaceDisplay(props({ city: 'Newyork' }), null);
    expect(twoWords.key).not.toBe(oneWord.key);
  });

  it('produces the same dedupe key regardless of case or whitespace', () => {
    const a = formatPlaceDisplay(
      props({ city: 'Cologne', country: 'Germany' }),
      null,
    );
    const b = formatPlaceDisplay(
      props({ city: '  COLOGNE ', country: 'germany' }),
      null,
    );
    expect(a.key).toBe(b.key);
  });

  it('falls back to the region name when country is absent but countrycode is present', () => {
    const regionNames = {
      of: (code: string) => `Region:${code}`,
    } as Intl.DisplayNames;
    const { line2 } = formatPlaceDisplay(
      props({ countrycode: 'de' }),
      regionNames,
    );
    expect(line2).toBe('Region:DE');
  });
});

describe('dedupePhotonFeatures', () => {
  it('collapses two entries sharing an osm_id into one (last one wins)', () => {
    const a = feature(1, { city: 'Cologne' });
    const b = feature(1, { city: 'Different but same id' });
    expect(dedupePhotonFeatures([a, b], null)).toEqual([b]);
  });

  it('drops a later feature with a different osm_id but identical display', () => {
    const a = feature(1, { city: 'Cologne', country: 'Germany' });
    const b = feature(2, { city: 'Cologne', country: 'Germany' });
    expect(dedupePhotonFeatures([a, b], null)).toEqual([a]);
  });

  it('keeps features that are genuinely distinct', () => {
    const a = feature(1, { city: 'Cologne' });
    const b = feature(2, { city: 'Berlin' });
    expect(dedupePhotonFeatures([a, b], null)).toEqual([a, b]);
  });
});

describe('usePhotonSearch choose', () => {
  // `focus` is left at its initial `false` here deliberately: setting it
  // true first would make choose()'s own setFocus(false) a genuine
  // false->true->false transition, and the search effect's own reset
  // (triggered by that same focus change) would clear `results`/`activeIdx`
  // right behind it, masking whether choose() ever touched them itself.
  it('clears results, resets the active index, and closes focus after picking', () => {
    const { result } = renderHook(() => usePhotonSearch('en'));

    let choice: PlaceChoice | undefined;
    act(() => {
      choice = result.current.choose(feature(1, { city: 'Cologne' }));
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.activeIdx).toBe(-1);
    expect(result.current.focus).toBe(false);
    expect(choice).toEqual({
      label: 'Cologne',
      coords: { lat: 0, lng: 0 },
    });
  });

  it('keeps just the country from a state+country line2, not the whole thing', () => {
    const { result } = renderHook(() => usePhotonSearch('en'));

    let choice: PlaceChoice | undefined;
    act(() => {
      choice = result.current.choose(
        feature(1, { city: 'Cologne', state: 'NRW', country: 'Germany' }),
      );
    });

    expect(choice?.label).toBe('Cologne, Germany');
  });

  it('uses whichever locale is current when picked, not the one active when the hook first mounted', () => {
    const { result, rerender } = renderHook(
      ({ locale }) => usePhotonSearch(locale),
      { initialProps: { locale: 'de' } },
    );

    let deChoice: PlaceChoice | undefined;
    act(() => {
      deChoice = result.current.choose(
        feature(1, { city: 'Cologne', countrycode: 'fr' }),
      );
    });

    rerender({ locale: 'en' });

    let enChoice: PlaceChoice | undefined;
    act(() => {
      enChoice = result.current.choose(
        feature(1, { city: 'Cologne', countrycode: 'fr' }),
      );
    });

    expect(deChoice?.label).not.toBe(enChoice?.label);
  });
});

function keyEvent(key: string) {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  return {
    event: {
      key,
      preventDefault,
      stopPropagation,
    } as unknown as React.KeyboardEvent<HTMLInputElement>,
    preventDefault,
    stopPropagation,
  };
}

// Drives a real search to completion so `results` is genuinely populated,
// rather than poking hook state directly.
async function searchAndGetResults(features: PhotonFeature[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features }),
    }),
  );
  const { result } = renderHook(() => usePhotonSearch('en'));
  act(() => {
    result.current.setFocus(true);
    result.current.setQuery('Col');
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  return result;
}

describe('usePhotonSearch initial state', () => {
  it('starts with an empty query', () => {
    const { result } = renderHook(() => usePhotonSearch('en'));

    expect(result.current.query).toBe('');
  });

  it('starts with nothing found, nothing loading, nothing failed, and nothing selected', () => {
    const { result } = renderHook(() => usePhotonSearch('en'));

    expect(result.current.results).toEqual([]);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(false);
    expect(result.current.searched).toBe(false);
    expect(result.current.activeIdx).toBe(-1);
  });

  // The mount effect resets all five, so reading them after effects have
  // flushed cannot tell a wrong seed from a corrected one -- this looks at
  // the render pass the user actually sees first.
  it('paints its very first render already empty, never flashing a menu, a spinner or an error', () => {
    const passes: {
      results: PhotonFeature[];
      loading: boolean;
      error: boolean;
      searched: boolean;
      activeIdx: number;
    }[] = [];
    function Probe() {
      const { results, loading, error, searched, activeIdx } =
        usePhotonSearch('en');
      passes.push({ results, loading, error, searched, activeIdx });
      return null;
    }

    render(createElement(Probe));

    expect(passes[0]).toEqual({
      results: [],
      loading: false,
      error: false,
      searched: false,
      activeIdx: -1,
    });
  });
});

describe('usePhotonSearch onKeyDown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('moves the active index down and wraps from the last option to the first', async () => {
    const result = await searchAndGetResults([
      feature(1, { city: 'Cologne' }),
      feature(2, { city: 'Colmar' }),
    ]);

    act(() => {
      result.current.onKeyDown(keyEvent('ArrowDown').event);
    });
    expect(result.current.activeIdx).toBe(0);

    act(() => {
      result.current.onKeyDown(keyEvent('ArrowDown').event);
    });
    expect(result.current.activeIdx).toBe(1);

    act(() => {
      result.current.onKeyDown(keyEvent('ArrowDown').event);
    });
    expect(result.current.activeIdx).toBe(0);
  });

  it('moves the active index up and wraps from the first option to the last', async () => {
    const result = await searchAndGetResults([
      feature(1, { city: 'Cologne' }),
      feature(2, { city: 'Colmar' }),
      feature(3, { city: 'Colditz' }),
    ]);

    // Starting from -1 (nothing chosen yet), ArrowUp goes straight to the
    // last option rather than to some out-of-range index.
    act(() => {
      result.current.onKeyDown(keyEvent('ArrowUp').event);
    });
    expect(result.current.activeIdx).toBe(2);

    act(() => {
      result.current.onKeyDown(keyEvent('ArrowUp').event);
    });
    expect(result.current.activeIdx).toBe(1);

    act(() => {
      result.current.setActiveIdx(0);
    });
    act(() => {
      result.current.onKeyDown(keyEvent('ArrowUp').event);
    });
    expect(result.current.activeIdx).toBe(2);
  });

  it('preventDefaults ArrowUp so page scroll does not fight the menu', async () => {
    const result = await searchAndGetResults([feature(1, { city: 'Cologne' })]);
    const { event, preventDefault } = keyEvent('ArrowUp');

    act(() => {
      result.current.onKeyDown(event);
    });

    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it('Enter with no prior arrow key picks the first result', async () => {
    const result = await searchAndGetResults([
      feature(1, { city: 'Cologne' }),
      feature(2, { city: 'Colmar' }),
    ]);

    let choice: PlaceChoice | undefined;
    act(() => {
      choice = result.current.onKeyDown(keyEvent('Enter').event);
    });

    expect(choice?.label).toBe('Cologne');
  });

  it('Enter picks whichever option the arrow keys actually landed on', async () => {
    const result = await searchAndGetResults([
      feature(1, { city: 'Cologne' }),
      feature(2, { city: 'Colmar' }),
    ]);

    act(() => {
      result.current.onKeyDown(keyEvent('ArrowDown').event);
    });
    act(() => {
      result.current.onKeyDown(keyEvent('ArrowDown').event);
    });
    // activeIdx is now 1 (Colmar), not 0 (Cologne).
    let choice: PlaceChoice | undefined;
    act(() => {
      choice = result.current.onKeyDown(keyEvent('Enter').event);
    });

    expect(choice?.label).toBe('Colmar');
  });

  it('does nothing on Enter when the active index no longer points at a real result', async () => {
    const result = await searchAndGetResults([feature(1, { city: 'Cologne' })]);
    act(() => {
      result.current.setActiveIdx(99);
    });

    let choice: PlaceChoice | undefined;
    act(() => {
      choice = result.current.onKeyDown(keyEvent('Enter').event);
    });

    expect(choice).toBeUndefined();
    // Nothing was picked -- the menu's own state is untouched.
    expect(result.current.results).toHaveLength(1);
  });

  it('ignores a key that is none of ArrowUp/ArrowDown/Enter/Escape', async () => {
    const result = await searchAndGetResults([feature(1, { city: 'Cologne' })]);
    const { event, preventDefault, stopPropagation } = keyEvent('a');

    act(() => {
      result.current.onKeyDown(event);
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(result.current.results).toHaveLength(1);
    expect(result.current.focus).toBe(true);
  });

  // Regression: Escape used to bubble to the modal's own listener and close
  // the whole form instead of just dismissing the suggestion menu.
  it('stops Escape from propagating once suggestions are open, instead of only clearing local state', async () => {
    vi.useFakeTimers();
    try {
      const hit = feature(1, { city: 'Cologne' });
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ features: [hit] }),
        }),
      );

      const { result } = renderHook(() => usePhotonSearch('en'));

      act(() => {
        result.current.setFocus(true);
        result.current.setQuery('Col');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(result.current.results.length).toBe(1);

      const preventDefault = vi.fn();
      const stopPropagation = vi.fn();
      const event = {
        key: 'Escape',
        preventDefault,
        stopPropagation,
      } as unknown as React.KeyboardEvent<HTMLInputElement>;
      act(() => {
        result.current.onKeyDown(event);
      });

      expect(preventDefault).toHaveBeenCalledOnce();
      expect(stopPropagation).toHaveBeenCalledOnce();
      expect(result.current.results).toEqual([]);
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });

  it('leaves Escape alone when there is no suggestion menu to dismiss', () => {
    const { result } = renderHook(() => usePhotonSearch('en'));
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const event = {
      key: 'Escape',
      preventDefault,
      stopPropagation,
    } as unknown as React.KeyboardEvent<HTMLInputElement>;
    act(() => {
      result.current.onKeyDown(event);
    });
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });
});

describe('usePhotonSearch search effect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('treats a non-ok HTTP response as a failure, never reaching its body', async () => {
    // A working `.json()` on the failure response, so the assertion below
    // is actually exercising the `!res.ok` throw -- not just riding along
    // on a response object that would have crashed either way.
    const json = vi.fn().mockResolvedValue({
      features: [feature(1, { city: 'Should never be read' })],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, json }),
    );
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = renderHook(() => usePhotonSearch('en'));

    act(() => {
      result.current.setFocus(true);
      result.current.setQuery('Col');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.error).toBe(true);
    expect(result.current.results).toEqual([]);
    expect(result.current.activeIdx).toBe(-1);
    expect(result.current.loading).toBe(false);
    expect(result.current.searched).toBe(true);
    expect(json).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith(
      'Place search failed:',
      expect.objectContaining({ message: 'HTTP 500' }),
    );
    consoleError.mockRestore();
  });

  it('asks Photon for the limit and language the hook is configured with', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => usePhotonSearch('de'));

    act(() => {
      result.current.setFocus(true);
      result.current.setQuery('Köln');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get('limit')).toBe('5');
    expect(requestedUrl.searchParams.get('lang')).toBe('de');
  });

  // Some runtimes (older engines, certain embedders) never shipped
  // `Intl.DisplayNames` at all -- the hook has to keep working without a
  // region name rather than crash the whole search on construction.
  it('drops the country name, rather than crashing, when Intl.DisplayNames is unavailable', async () => {
    const originalDisplayNames = Intl.DisplayNames;
    (Intl as { DisplayNames?: typeof Intl.DisplayNames }).DisplayNames =
      undefined;
    try {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            features: [feature(1, { city: 'Cologne', countrycode: 'de' })],
          }),
        }),
      );
      const { result } = renderHook(() => usePhotonSearch('en'));

      act(() => {
        result.current.setFocus(true);
        result.current.setQuery('Col');
      });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(result.current.results).toHaveLength(1);
      const choice = result.current.choose(result.current.results[0]);
      expect(choice.label).toBe('Cologne');
    } finally {
      (Intl as { DisplayNames?: typeof Intl.DisplayNames }).DisplayNames =
        originalDisplayNames;
    }
  });

  // A slower first request superseded by a second must not report itself as
  // a failure just because its own fetch was the one that got aborted.
  it('does not treat a request aborted by a newer search as a failure', async () => {
    let rejectFirst!: (err: unknown) => void;
    const firstResponse = new Promise((_resolve, reject) => {
      rejectFirst = reject;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url: string, opts: { signal: AbortSignal }) => {
        opts.signal.addEventListener('abort', () => {
          rejectFirst(new DOMException('Aborted', 'AbortError'));
        });
        return firstResponse;
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ features: [feature(1, { city: 'Cologne' })] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePhotonSearch('en'));
    act(() => {
      result.current.setFocus(true);
      result.current.setQuery('Col');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.loading).toBe(true);

    // A second, distinct query re-fires the debounce, aborting the first
    // request's controller before the new one starts.
    act(() => {
      result.current.setQuery('Colo');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.error).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.results).toHaveLength(1);
  });

  // The superseded request's own `finally` still runs whenever it settles,
  // abort or not. Cancelling it via the effect's cleanup (blur, a new
  // query) always resolves its rejection well before a *later* debounce
  // could possibly reassign `abortRef` to a new controller -- so the only
  // way to actually reach this guard with a stale controller is a request
  // that keeps running (ignoring its abort signal entirely, as a real one
  // never would) and settles late, after a normal new one has already
  // taken over and is *still itself in flight*.
  it('keeps loading true while a genuinely in-flight newer request is unaffected by an earlier one settling late', async () => {
    let rejectFirst!: (err: unknown) => void;
    const firstResponse = new Promise((_resolve, reject) => {
      rejectFirst = reject;
    });
    const secondResponse = new Promise(() => {
      // Deliberately never settles -- this test only cares about the
      // window while the second request is still genuinely in flight.
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstResponse)
      .mockImplementationOnce(() => secondResponse);
    vi.stubGlobal('fetch', fetchMock);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { result } = renderHook(() => usePhotonSearch('en'));
    act(() => {
      result.current.setFocus(true);
      result.current.setQuery('Col');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    act(() => {
      result.current.setQuery('Colo');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.current.loading).toBe(true);
    expect(result.current.searched).toBe(false);

    // The first request -- ignoring its own abort signal, as configured
    // above -- now fails for real, well after the second took over.
    await act(async () => {
      rejectFirst(new Error('a slow, stale request finally gives up'));
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.searched).toBe(false);
    expect(result.current.error).toBe(false);
    consoleError.mockRestore();
  });

  // Not every DOMException a fetch can reject with is an abort -- a real
  // one (a different `name`) must still be reported, not swallowed by a
  // check that treats "any DOMException" as "we did this to ourselves".
  it('reports a DOMException that is not actually an abort as a real failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockRejectedValue(
          new DOMException('The network changed', 'NetworkError'),
        ),
    );
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = renderHook(() => usePhotonSearch('en'));

    act(() => {
      result.current.setFocus(true);
      result.current.setQuery('Col');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.error).toBe(true);
    expect(result.current.loading).toBe(false);
    consoleError.mockRestore();
  });

  // The effect's own cleanup (blur, or the query dropping below the search
  // threshold) aborts whatever is in flight *without* starting a
  // replacement -- unlike a newer search superseding an older one, nothing
  // else is left to define what state this leaves behind.
  it('does not show an error when the in-flight request is cancelled by blurring, not by a newer search', async () => {
    let rejectPending!: (err: unknown) => void;
    const pending = new Promise((_resolve, reject) => {
      rejectPending = reject;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce((_url: string, opts: { signal: AbortSignal }) => {
        opts.signal.addEventListener('abort', () => {
          rejectPending(new DOMException('Aborted', 'AbortError'));
        });
        return pending;
      });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePhotonSearch('en'));
    act(() => {
      result.current.setFocus(true);
      result.current.setQuery('Col');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Blurring flips `focus` false, which the search effect treats as
    // "nothing to search for" -- its cleanup aborts the in-flight fetch
    // without ever assigning a new controller to replace it.
    await act(async () => {
      result.current.setFocus(false);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.error).toBe(false);
  });

  // Real fetches always reject once aborted, but the guard exists
  // specifically for the case where a slower response still lands anyway
  // (see the comment in the hook) -- so the test has to construct exactly
  // that: a first request that resolves normally, later, after a second
  // one has already taken over.
  it('ignores a slower first response that resolves successfully after a newer search has already taken over', async () => {
    let resolveFirst!: (v: unknown) => void;
    const firstResponse = new Promise((resolve) => {
      resolveFirst = resolve;
    });
    let resolveSecond!: (v: unknown) => void;
    const secondResponse = new Promise((resolve) => {
      resolveSecond = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstResponse)
      .mockImplementationOnce(() => secondResponse);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePhotonSearch('en'));
    act(() => {
      result.current.setFocus(true);
      result.current.setQuery('Col');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    act(() => {
      result.current.setQuery('Colo');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Resolve the second (current) request first, with real results.
    await act(async () => {
      resolveSecond({
        ok: true,
        json: async () => ({ features: [feature(2, { city: 'Colmar' })] }),
      });
    });
    expect(result.current.results).toEqual([feature(2, { city: 'Colmar' })]);
    expect(result.current.loading).toBe(false);

    // The stale first request now lands too, well after being superseded.
    // It must not overwrite the current results, reopen `loading`, or mark
    // the search as freshly `searched` again.
    await act(async () => {
      resolveFirst({
        ok: true,
        json: async () => ({ features: [feature(1, { city: 'Cologne' })] }),
      });
    });
    expect(result.current.results).toEqual([feature(2, { city: 'Colmar' })]);
    expect(result.current.loading).toBe(false);
  });

  it('cancels a still-pending debounce timer on the next keystroke, rather than firing both', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePhotonSearch('en'));
    act(() => {
      result.current.setFocus(true);
      result.current.setQuery('Col');
    });
    // Well within the 300ms debounce window -- the first timer must never
    // fire at all.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    expect(fetchMock).not.toHaveBeenCalled();

    act(() => {
      result.current.setQuery('Colo');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('Colo');
  });

  it('trims the query before sending it, even though the debounce/length check already trimmed a copy', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => usePhotonSearch('en'));

    act(() => {
      result.current.setFocus(true);
      result.current.setQuery('  Cologne  ');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get('q')).toBe('Cologne');
  });

  it('resets results, the active index, and the error/searched flags back to their starting values on blur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = renderHook(() => usePhotonSearch('en'));

    act(() => {
      result.current.setFocus(true);
      result.current.setQuery('Col');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    act(() => {
      result.current.setActiveIdx(3);
    });
    expect(result.current.error).toBe(true);
    expect(result.current.searched).toBe(true);
    expect(result.current.activeIdx).toBe(3);

    act(() => {
      result.current.setFocus(false);
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.activeIdx).toBe(-1);
    expect(result.current.error).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.searched).toBe(false);
    consoleError.mockRestore();
  });

  it('marks a freshly-typed query as not-yet-searched again, not still carrying the previous search’s answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => usePhotonSearch('en'));

    act(() => {
      result.current.setFocus(true);
      result.current.setQuery('Col');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(result.current.searched).toBe(true);

    act(() => {
      result.current.setQuery('Colo');
    });
    // Still inside the new debounce window -- the old answer must not be
    // presented as though it already covers this query.
    expect(result.current.searched).toBe(false);
  });

  it('never attaches its outside-click listener before the field has ever been focused', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');

    renderHook(() => usePhotonSearch('en'));

    expect(
      addSpy.mock.calls.filter(([type]) => type === 'mousedown'),
    ).toHaveLength(0);
    addSpy.mockRestore();
  });

  // The staleness guard in the catch block exists for exactly this: a
  // non-abort failure landing late, after a different (and successful)
  // request has already taken over -- it must not clobber that result.
  it('ignores a stale, genuinely-failed response that lands after a newer search already succeeded', async () => {
    let rejectFirst!: (err: unknown) => void;
    const firstResponse = new Promise((_resolve, reject) => {
      rejectFirst = reject;
    });
    let resolveSecond!: (v: unknown) => void;
    const secondResponse = new Promise((resolve) => {
      resolveSecond = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstResponse)
      .mockImplementationOnce(() => secondResponse);
    vi.stubGlobal('fetch', fetchMock);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { result } = renderHook(() => usePhotonSearch('en'));
    act(() => {
      result.current.setFocus(true);
      result.current.setQuery('Col');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    act(() => {
      result.current.setQuery('Colo');
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    await act(async () => {
      resolveSecond({
        ok: true,
        json: async () => ({ features: [feature(2, { city: 'Colmar' })] }),
      });
    });
    expect(result.current.results).toEqual([feature(2, { city: 'Colmar' })]);
    expect(result.current.error).toBe(false);

    // The stale first request now fails for real (not an abort), well
    // after being superseded.
    await act(async () => {
      rejectFirst(new Error('stale network failure'));
    });

    expect(result.current.results).toEqual([feature(2, { city: 'Colmar' })]);
    expect(result.current.error).toBe(false);
    consoleError.mockRestore();
  });
});

describe('isQueryLongEnough', () => {
  it('rejects fewer than 3 characters', () => {
    expect(isQueryLongEnough('')).toBe(false);
    expect(isQueryLongEnough('a')).toBe(false);
    expect(isQueryLongEnough('ab')).toBe(false);
  });

  it('accepts exactly 3 characters', () => {
    expect(isQueryLongEnough('abc')).toBe(true);
  });

  it('accepts more than 3 characters', () => {
    expect(isQueryLongEnough('abcd')).toBe(true);
  });

  it('measures the trimmed length, not the raw length', () => {
    expect(isQueryLongEnough('  ab  ')).toBe(false);
    expect(isQueryLongEnough('  abc  ')).toBe(true);
  });

  it('accepts a two-character non-ASCII query, matching the PostgREST filter', () => {
    expect(isQueryLongEnough('京')).toBe(false);
    expect(isQueryLongEnough('京都')).toBe(true);
  });
});
