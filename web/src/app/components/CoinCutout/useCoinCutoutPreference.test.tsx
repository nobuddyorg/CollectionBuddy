// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  COIN_CUTOUT_STORAGE_KEY,
  readCoinCutoutEnabled,
  useCoinCutoutPreference,
} from './useCoinCutoutPreference';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useCoinCutoutPreference', () => {
  it('is off until this browser opts in', () => {
    const { result } = renderHook(() => useCoinCutoutPreference());

    expect(result.current.enabled).toBe(false);
  });

  it('turns on and off, remembering the choice in local storage', () => {
    const { result } = renderHook(() => useCoinCutoutPreference());

    act(() => result.current.setEnabled(true));
    expect(result.current.enabled).toBe(true);
    expect(localStorage.getItem(COIN_CUTOUT_STORAGE_KEY)).toBe('on');

    act(() => result.current.setEnabled(false));
    expect(result.current.enabled).toBe(false);
    expect(localStorage.getItem(COIN_CUTOUT_STORAGE_KEY)).toBeNull();
  });

  it('follows a change made in another tab', () => {
    const { result } = renderHook(() => useCoinCutoutPreference());

    act(() => {
      localStorage.setItem(COIN_CUTOUT_STORAGE_KEY, 'on');
      window.dispatchEvent(new StorageEvent('storage'));
    });

    expect(result.current.enabled).toBe(true);
  });

  it('keeps two mounted controls in step within one tab', () => {
    const first = renderHook(() => useCoinCutoutPreference());
    const second = renderHook(() => useCoinCutoutPreference());

    act(() => first.result.current.setEnabled(true));

    expect(second.result.current.enabled).toBe(true);
  });

  it('stops listening once unmounted', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useCoinCutoutPreference());

    unmount();

    expect(remove).toHaveBeenCalledWith('storage', expect.any(Function));
    expect(remove).toHaveBeenCalledWith(
      'collectionbuddy:coin-cutout',
      expect.any(Function),
    );
  });

  it('renders off on the server', () => {
    function Probe() {
      return <span>{String(useCoinCutoutPreference().enabled)}</span>;
    }
    localStorage.setItem(COIN_CUTOUT_STORAGE_KEY, 'on');

    expect(renderToString(<Probe />)).toContain('false');
  });
});

describe('readCoinCutoutEnabled', () => {
  it('reads only the exact opt-in value as on', () => {
    localStorage.setItem(COIN_CUTOUT_STORAGE_KEY, 'yes');

    expect(readCoinCutoutEnabled()).toBe(false);
  });

  it('stays off when storage refuses access', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(readCoinCutoutEnabled()).toBe(false);
  });
});
