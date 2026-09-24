import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';

import { usePlaces } from './usePlaces';
import { updateItemsPlace } from '../../data/items';

// Relies on the importing test file's `vi.mock('../../data/items')`, which Vitest applies to this module too.
export function installUsePlacesMocks() {
  vi.clearAllMocks();
  vi.mocked(updateItemsPlace).mockResolvedValue({ error: null });
  localStorage.clear();
}

export function restoreGlobalsAndTimers() {
  vi.unstubAllGlobals();
  vi.useRealTimers();
}

export function renderUsePlaces() {
  return renderHook(() =>
    usePlaces({ categoryId: 'cat-1', search: '', enabled: true }),
  );
}
