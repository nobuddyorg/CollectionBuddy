// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PAGE_SIZE_STORAGE_KEY,
  readPageSize,
  usePageSize,
} from './usePageSize';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('usePageSize', () => {
  it('shows the default, 9, until this device chooses another size', () => {
    const { result } = renderHook(() => usePageSize());

    expect(result.current.pageSize).toBe(9);
  });

  it('remembers another size, and forgets the key for the default', () => {
    const { result } = renderHook(() => usePageSize());

    act(() => result.current.setPageSize(24));
    expect(result.current.pageSize).toBe(24);
    expect(localStorage.getItem(PAGE_SIZE_STORAGE_KEY)).toBe('24');

    act(() => result.current.setPageSize(9));
    expect(result.current.pageSize).toBe(9);
    expect(localStorage.getItem(PAGE_SIZE_STORAGE_KEY)).toBeNull();
  });

  it('follows a change made in another tab', () => {
    const { result } = renderHook(() => usePageSize());

    act(() => {
      localStorage.setItem(PAGE_SIZE_STORAGE_KEY, '6');
      window.dispatchEvent(new Event('storage'));
    });

    expect(result.current.pageSize).toBe(6);
  });

  it('keeps every list in step within one tab', () => {
    const first = renderHook(() => usePageSize());
    const second = renderHook(() => usePageSize());

    act(() => first.result.current.setPageSize(12));

    expect(second.result.current.pageSize).toBe(12);
  });

  it('stops listening once unmounted', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => usePageSize());

    unmount();

    expect(remove).toHaveBeenCalledWith('storage', expect.any(Function));
    expect(remove).toHaveBeenCalledWith(
      'collectionbuddy:page-size',
      expect.any(Function),
    );
  });

  it('renders the default on the server', () => {
    function Probe() {
      return <span>{usePageSize().pageSize}</span>;
    }
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, '24');

    expect(renderToString(<Probe />)).toContain('9');
  });
});

describe('readPageSize', () => {
  it('reads the stored size, and the default for one that is not offered', () => {
    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, '12');
    expect(readPageSize()).toBe(12);

    localStorage.setItem(PAGE_SIZE_STORAGE_KEY, '100');
    expect(readPageSize()).toBe(9);
  });

  it('falls back to the default when storage refuses access', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    expect(readPageSize()).toBe(9);
  });
});
