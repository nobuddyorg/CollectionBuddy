// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePhotonSearch } from './usePhoton';
import { feature } from './usePhoton.test-support';

function emptyPhoton() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ features: [] }),
  });
}

describe('usePhotonSearch search effect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('treats a non-ok HTTP response as a failure, never reaching its body', async () => {
    // A working `.json()` on the failure, so the assertion exercises the `!response.ok` throw itself.
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
    expect(result.current.activeIndex).toBe(-1);
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
    const fetchMock = emptyPhoton();
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

  // Some runtimes never shipped `Intl.DisplayNames`; the search must keep working without a region name.
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

  // Not every DOMException a fetch rejects with is an abort; a different `name` is a real failure.
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

  it('cancels a still-pending debounce timer on the next keystroke, rather than firing both', async () => {
    const fetchMock = emptyPhoton();
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => usePhotonSearch('en'));
    act(() => {
      result.current.setFocus(true);
      result.current.setQuery('Col');
    });
    // Well within the 300ms debounce window: the first timer must never fire at all.
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
    const fetchMock = emptyPhoton();
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
      result.current.setActiveIndex(3);
    });
    expect(result.current.error).toBe(true);
    expect(result.current.searched).toBe(true);
    expect(result.current.activeIndex).toBe(3);

    act(() => {
      result.current.setFocus(false);
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.activeIndex).toBe(-1);
    expect(result.current.error).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.searched).toBe(false);
    consoleError.mockRestore();
  });

  it('marks a freshly-typed query as not-yet-searched again, not still carrying the previous search’s answer', async () => {
    vi.stubGlobal('fetch', emptyPhoton());
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
    // Still inside the new debounce window: the old answer must not be presented as covering this query.
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
});
