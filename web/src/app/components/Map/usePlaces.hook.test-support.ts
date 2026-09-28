import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';

import { usePlaces } from './usePlaces';
import { updateItemsPlace } from '../../data/items';

type UsePlacesOptions = Parameters<typeof usePlaces>[0];

const DEFAULT_OPTIONS = {
  categoryId: 'cat-1',
  search: '',
  enabled: true,
  canEdit: true,
};

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

// rerender() replaces the props outright, so the defaults merge inside the callback, not into initialProps.
export function renderUsePlaces(initial: Partial<UsePlacesOptions> = {}) {
  return renderHook(
    (props: Partial<UsePlacesOptions>) =>
      usePlaces({ ...DEFAULT_OPTIONS, ...props }),
    { initialProps: initial },
  );
}
