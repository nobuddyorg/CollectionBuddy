// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  keyEvent,
  renderPhotonSearch,
  searchFor,
} from './usePhoton.hook.test-support';
import { feature, photonAnswer } from './usePhoton.test-support';

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
    const { result } = renderPhotonSearch();

    await searchFor(result, 'Col');

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
    const fetchMock = vi.fn().mockResolvedValue(photonAnswer());
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderPhotonSearch('de');

    await searchFor(result, 'Köln');

    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get('limit')).toBe('5');
    expect(requestedUrl.searchParams.get('lang')).toBe('de');
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
    const { result } = renderPhotonSearch();

    await searchFor(result, 'Col');

    expect(result.current.error).toBe(true);
    expect(result.current.loading).toBe(false);
    consoleError.mockRestore();
  });

  it('cancels a still-pending debounce timer on the next keystroke, rather than firing both', async () => {
    const fetchMock = vi.fn().mockResolvedValue(photonAnswer());
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderPhotonSearch();
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
    const fetchMock = vi.fn().mockResolvedValue(photonAnswer());
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderPhotonSearch();

    await searchFor(result, '  Cologne  ');

    const requestedUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestedUrl.searchParams.get('q')).toBe('Cologne');
  });

  it('resets the error and searched flags back to their starting values on blur', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = renderPhotonSearch();

    await searchFor(result, 'Col');
    expect(result.current.error).toBe(true);
    expect(result.current.searched).toBe(true);

    act(() => {
      result.current.setFocus(false);
    });

    expect(result.current.error).toBe(false);
    expect(result.current.loading).toBe(false);
    expect(result.current.searched).toBe(false);
    consoleError.mockRestore();
  });

  it('drops the results and the highlighted option on blur', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(photonAnswer([feature(1, { city: 'Cologne' })])),
    );
    const { result } = renderPhotonSearch();

    await searchFor(result, 'Col');
    act(() => {
      result.current.onKeyDown(keyEvent('ArrowDown').event);
    });
    expect(result.current.results).toHaveLength(1);
    expect(result.current.activeIndex).toBe(0);

    act(() => {
      result.current.setFocus(false);
    });

    expect(result.current.results).toEqual([]);
    expect(result.current.activeIndex).toBe(-1);
  });

  it('marks a freshly-typed query as not-yet-searched again, not still carrying the previous search’s answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(photonAnswer()));
    const { result } = renderPhotonSearch();

    await searchFor(result, 'Col');
    expect(result.current.searched).toBe(true);

    act(() => {
      result.current.setQuery('Colo');
    });
    // Still inside the new debounce window: the old answer must not be presented as covering this query.
    expect(result.current.searched).toBe(false);
  });

  it('searches for nothing when focused before any query has been set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(photonAnswer());
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderPhotonSearch();

    act(() => {
      result.current.setFocus(true);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.searched).toBe(false);
  });

  it('never attaches its outside-click listener before the field has ever been focused', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');

    renderPhotonSearch();

    expect(
      addSpy.mock.calls.filter(([type]) => type === 'mousedown'),
    ).toHaveLength(0);
    addSpy.mockRestore();
  });
});
