// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  normalizePhotoBackdrop,
  PHOTO_BACKDROP_STORAGE_KEY,
  PHOTO_BACKDROPS,
  photoBackdropClass,
  usePhotoBackdrop,
} from './usePhotoBackdrop';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('normalizePhotoBackdrop', () => {
  it.each([
    ['black', 'black'],
    ['white', 'white'],
    [null, 'theme'],
    ['theme', 'theme'],
    ['grey', 'theme'],
    ['BLACK', 'theme'],
  ] as const)('reads %s as %s', (stored, backdrop) => {
    expect(normalizePhotoBackdrop(stored)).toBe(backdrop);
  });
});

describe('photoBackdropClass', () => {
  it('lays black or white behind a photo, and nothing over the theme’s own surface', () => {
    expect(photoBackdropClass('black')).toBe('bg-black');
    expect(photoBackdropClass('white')).toBe('bg-white');
    expect(photoBackdropClass('theme')).toBe('');
  });
});

describe('usePhotoBackdrop', () => {
  it('offers the theme first, then black and white', () => {
    expect(PHOTO_BACKDROPS).toEqual(['theme', 'black', 'white']);
  });

  it('follows the theme until this browser chooses otherwise', () => {
    const { result } = renderHook(() => usePhotoBackdrop());

    expect(result.current.backdrop).toBe('theme');
  });

  it('remembers black and white in local storage, and forgets the key for the theme', () => {
    const { result } = renderHook(() => usePhotoBackdrop());

    act(() => result.current.setPhotoBackdrop('black'));
    expect(result.current.backdrop).toBe('black');
    expect(localStorage.getItem(PHOTO_BACKDROP_STORAGE_KEY)).toBe('black');

    act(() => result.current.setPhotoBackdrop('white'));
    expect(result.current.backdrop).toBe('white');
    expect(localStorage.getItem(PHOTO_BACKDROP_STORAGE_KEY)).toBe('white');

    act(() => result.current.setPhotoBackdrop('theme'));
    expect(result.current.backdrop).toBe('theme');
    expect(localStorage.getItem(PHOTO_BACKDROP_STORAGE_KEY)).toBeNull();
  });

  it('follows a change made in another tab', () => {
    const { result } = renderHook(() => usePhotoBackdrop());

    act(() => {
      localStorage.setItem(PHOTO_BACKDROP_STORAGE_KEY, 'white');
      window.dispatchEvent(new Event('storage'));
    });

    expect(result.current.backdrop).toBe('white');
  });

  it('keeps every photo in step within one tab', () => {
    const first = renderHook(() => usePhotoBackdrop());
    const second = renderHook(() => usePhotoBackdrop());

    act(() => first.result.current.setPhotoBackdrop('black'));

    expect(second.result.current.backdrop).toBe('black');
  });

  it('stops listening once unmounted', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => usePhotoBackdrop());

    unmount();

    expect(remove).toHaveBeenCalledWith('storage', expect.any(Function));
    expect(remove).toHaveBeenCalledWith(
      'collectionbuddy:photo-backdrop',
      expect.any(Function),
    );
  });

  it('renders the theme’s on the server', () => {
    function Probe() {
      return <span>{usePhotoBackdrop().backdrop}</span>;
    }
    localStorage.setItem(PHOTO_BACKDROP_STORAGE_KEY, 'black');

    expect(renderToString(<Probe />)).toContain('theme');
  });

  it('follows the theme when storage refuses access', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });

    const { result } = renderHook(() => usePhotoBackdrop());

    expect(result.current.backdrop).toBe('theme');
  });
});
