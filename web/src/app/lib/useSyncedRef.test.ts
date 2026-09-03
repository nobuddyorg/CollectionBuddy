// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useSyncedRef } from './useSyncedRef';

describe('useSyncedRef', () => {
  it('starts out holding the initial value', () => {
    const { result } = renderHook(() => useSyncedRef('first'));
    expect(result.current.current).toBe('first');
  });

  it('tracks the latest value across re-renders without changing identity', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useSyncedRef(value),
      { initialProps: { value: 'first' } },
    );
    const ref = result.current;

    rerender({ value: 'second' });

    expect(result.current).toBe(ref);
    expect(result.current.current).toBe('second');
  });
});
