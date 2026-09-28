// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BACKGROUND_REMOVAL_STORAGE_KEY,
  readBackgroundRemovalEnabled,
  useBackgroundRemovalPreference,
} from './useBackgroundRemovalPreference';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useBackgroundRemovalPreference', () => {
  it('is off until this browser opts in', () => {
    const { result } = renderHook(() => useBackgroundRemovalPreference());

    expect(result.current.enabled).toBe(false);
  });

  it('turns on and off, remembering the choice in local storage', () => {
    const { result } = renderHook(() => useBackgroundRemovalPreference());

    act(() => result.current.setEnabled(true));
    expect(result.current.enabled).toBe(true);
    expect(localStorage.getItem(BACKGROUND_REMOVAL_STORAGE_KEY)).toBe('on');

    act(() => result.current.setEnabled(false));
    expect(result.current.enabled).toBe(false);
    expect(localStorage.getItem(BACKGROUND_REMOVAL_STORAGE_KEY)).toBeNull();
  });

  it('follows a change made in another tab', () => {
    const { result } = renderHook(() => useBackgroundRemovalPreference());

    act(() => {
      localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'on');
      window.dispatchEvent(new StorageEvent('storage'));
    });

    expect(result.current.enabled).toBe(true);
  });

  it('keeps two mounted controls in step within one tab', () => {
    const first = renderHook(() => useBackgroundRemovalPreference());
    const second = renderHook(() => useBackgroundRemovalPreference());

    act(() => first.result.current.setEnabled(true));

    expect(second.result.current.enabled).toBe(true);
  });

  it('stops listening once unmounted', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useBackgroundRemovalPreference());

    unmount();

    expect(remove).toHaveBeenCalledWith('storage', expect.any(Function));
    expect(remove).toHaveBeenCalledWith(
      'collectionbuddy:background-removal',
      expect.any(Function),
    );
  });

  it('renders off on the server', () => {
    function Probe() {
      return <span>{String(useBackgroundRemovalPreference().enabled)}</span>;
    }
    localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'on');

    expect(renderToString(<Probe />)).toContain('false');
  });
});

describe('readBackgroundRemovalEnabled', () => {
  it('reads only the exact opt-in value as on', () => {
    localStorage.setItem(BACKGROUND_REMOVAL_STORAGE_KEY, 'yes');

    expect(readBackgroundRemovalEnabled()).toBe(false);
  });

  it('stays off when storage refuses access', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(readBackgroundRemovalEnabled()).toBe(false);
  });
});
