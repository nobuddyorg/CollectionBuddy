// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import {
  defaultImagesState,
  defaultMutationsState,
  itemsState,
  renderList,
} from './index.test-support';
import type { useItems } from './useItems';
import type { useItemImages } from './useItemImages';
import type { useItemMutations } from './useItemMutations';

// A failed prefetch of a lazy chunk must be swallowed, not surfaced as an unhandled rejection.
vi.mock('../Map', () => {
  throw new Error('chunk load failed');
});
vi.mock('../ItemForm', () => {
  throw new Error('chunk load failed');
});

const useItemsMock = vi.fn();
vi.mock('./useItems', () => ({
  useItems: (...args: unknown[]) =>
    useItemsMock(...args) as ReturnType<typeof useItems>,
}));

const useItemImagesMock = vi.fn();
vi.mock('./useItemImages', () => ({
  useItemImages: (...args: unknown[]) =>
    useItemImagesMock(...args) as ReturnType<typeof useItemImages>,
}));

const useItemMutationsMock = vi.fn();
vi.mock('./useItemMutations', () => ({
  useItemMutations: (...args: unknown[]) =>
    useItemMutationsMock(...args) as ReturnType<typeof useItemMutations>,
}));

describe('ItemList prefetch failures', () => {
  let onUnhandledRejection: Mock<() => void>;

  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    useItemsMock.mockReturnValue(itemsState());
    useItemImagesMock.mockReturnValue(defaultImagesState());
    useItemMutationsMock.mockReturnValue(defaultMutationsState());
    onUnhandledRejection = vi.fn();
    window.addEventListener('unhandledrejection', onUnhandledRejection);
  });

  afterEach(() => {
    window.removeEventListener('unhandledrejection', onUnhandledRejection);
  });

  async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  it('swallows a failed prefetch of the map chunk', async () => {
    renderList();
    fireEvent.focus(screen.getByRole('button', { name: 'Open Map' }));
    await flushMicrotasks();

    expect(onUnhandledRejection).not.toHaveBeenCalled();
  });

  it('swallows a failed prefetch of the new-entry form chunk', async () => {
    renderList();
    fireEvent.focus(screen.getByRole('button', { name: 'New entry' }));
    await flushMicrotasks();

    expect(onUnhandledRejection).not.toHaveBeenCalled();
  });
});
