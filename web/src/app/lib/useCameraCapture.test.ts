// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useCameraCapture } from './useCameraCapture';
import { stubCoarsePointer } from './useCameraCapture.test-support';

afterEach(() => {
  vi.restoreAllMocks();
});

function Probe() {
  return createElement('span', null, String(useCameraCapture()));
}

describe('useCameraCapture', () => {
  it('is true on a touch device, where `capture` opens a camera', () => {
    stubCoarsePointer(true);
    const { result } = renderHook(() => useCameraCapture());
    expect(result.current).toBe(true);
  });

  it('is false with a mouse, where `capture` is ignored', () => {
    stubCoarsePointer(false);
    const { result } = renderHook(() => useCameraCapture());
    expect(result.current).toBe(false);
  });

  it('follows the device changing, such as a keyboard dock being attached', () => {
    const setCoarse = stubCoarsePointer(false);
    const { result } = renderHook(() => useCameraCapture());

    act(() => setCoarse(true));

    expect(result.current).toBe(true);
  });

  it('is false while prerendering, whatever the build machine has', () => {
    stubCoarsePointer(true);
    expect(renderToString(createElement(Probe))).toBe('<span>false</span>');
  });

  it('stops listening once unmounted', () => {
    const setCoarse = stubCoarsePointer(false);
    const { unmount } = renderHook(() => useCameraCapture());
    unmount();
    expect(() => setCoarse(true)).not.toThrow();
  });
});
