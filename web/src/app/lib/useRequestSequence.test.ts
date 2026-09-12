// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useRequestSequence } from './useRequestSequence';

describe('useRequestSequence', () => {
  it('hands out a new number per request, starting above zero', () => {
    const { result } = renderHook(() => useRequestSequence());

    expect(result.current.next()).toBe(1);
    expect(result.current.next()).toBe(2);
  });

  // The whole point: the answer to a request a newer one has superseded is
  // dropped rather than raced against it.
  it('recognises only the latest request as current', () => {
    const { result } = renderHook(() => useRequestSequence());

    const first = result.current.next();
    expect(result.current.isCurrent(first)).toBe(true);

    const second = result.current.next();
    expect(result.current.isCurrent(first)).toBe(false);
    expect(result.current.isCurrent(second)).toBe(true);
  });

  // Both are meant to be safe to name in another callback's dependency
  // array; an identity that changed per render would defeat that.
  it('keeps one identity for both across re-renders', () => {
    const { result, rerender } = renderHook(() => useRequestSequence());
    const { next, isCurrent } = result.current;

    rerender();

    expect(result.current.next).toBe(next);
    expect(result.current.isCurrent).toBe(isCurrent);
  });
});
