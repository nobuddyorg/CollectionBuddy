// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useHelp } from './useHelp';

const pressHelpShortcut = (key = '/') => {
  const event = new KeyboardEvent('keydown', {
    key,
    ctrlKey: true,
    cancelable: true,
  });
  act(() => {
    document.dispatchEvent(event);
  });
  return event;
};

describe('useHelp', () => {
  it('starts closed', () => {
    const { result } = renderHook(() => useHelp());
    expect(result.current.open).toBe(false);
  });

  it('opens on show()', () => {
    const { result } = renderHook(() => useHelp());
    act(() => result.current.show());
    expect(result.current.open).toBe(true);
  });

  it('closes through setOpen, as the dialog does', () => {
    const { result } = renderHook(() => useHelp());
    act(() => result.current.show());
    act(() => result.current.setOpen(false));
    expect(result.current.open).toBe(false);
  });

  it('opens on Ctrl+/ and keeps the browser from acting on it too', () => {
    const { result } = renderHook(() => useHelp());
    const event = pressHelpShortcut();
    expect(result.current.open).toBe(true);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves any other key alone', () => {
    const { result } = renderHook(() => useHelp());
    const event = pressHelpShortcut('z');
    expect(result.current.open).toBe(false);
    expect(event.defaultPrevented).toBe(false);
  });

  it('stops listening once unmounted', () => {
    const { unmount } = renderHook(() => useHelp());
    unmount();
    expect(pressHelpShortcut().defaultPrevented).toBe(false);
  });

  // Opening re-renders the page; the bookkeeping is the only evidence the listener is not re-hung each time.
  it('hangs its listener once, not on every render', () => {
    const addListener = vi.spyOn(document, 'addEventListener');
    const { result } = renderHook(() => useHelp());
    act(() => result.current.show());
    act(() => result.current.setOpen(false));
    const keydowns = addListener.mock.calls.filter(
      ([event]) => event === 'keydown',
    );
    expect(keydowns).toHaveLength(1);
    addListener.mockRestore();
  });
});
