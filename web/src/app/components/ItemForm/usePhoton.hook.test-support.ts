import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';

import { usePhotonSearch } from './usePhoton';

export function renderPhotonSearch(language = 'en') {
  const onPick = vi.fn();
  const { result } = renderHook(() => usePhotonSearch({ language, onPick }));
  return { result, onPick };
}

export function keyEvent(key: string) {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  return {
    event: {
      key,
      preventDefault,
      stopPropagation,
    } as unknown as React.KeyboardEvent<HTMLInputElement>,
    preventDefault,
    stopPropagation,
  };
}

export async function searchFor(
  result: { current: ReturnType<typeof usePhotonSearch> },
  query: string,
) {
  act(() => {
    result.current.setFocus(true);
    result.current.setQuery(query);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
}
