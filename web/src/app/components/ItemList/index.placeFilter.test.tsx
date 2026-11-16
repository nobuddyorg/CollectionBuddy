// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  item,
  itemsState,
  renderList,
  resetHookMocks,
} from './index.test-support';
import type { useItems } from './useItems';
import type { useItemImages } from './useItemImages';
import type { useItemMutations } from './useItemMutations';

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

// The map has tests of its own; here only its "Show in list" matters, as the map hands it over.
const showPlace = vi.hoisted(() => ({
  current: (place: string): void => {
    throw new Error(`No map rendered to show ${place}`);
  },
}));
vi.mock('./MapModal', () => ({
  prefetchMap: () => {},
  MapModal: ({ onShowPlace }: { onShowPlace: (place: string) => void }) => {
    showPlace.current = onShowPlace;
    return null;
  },
}));

/** The place the last render asked useItems to narrow the list to. */
const placeAsked = () => useItemsMock.mock.calls.at(-1)?.[3] as string;

beforeEach(() => {
  resetHookMocks({ useItemsMock, useItemImagesMock, useItemMutationsMock });
  useItemsMock.mockReturnValue(itemsState({ items: [item('1')], total: 1 }));
});

describe('ItemList narrowed to one place', () => {
  it('lists every place until a pin’s Show in list narrows it, saying so in a chip', () => {
    renderList();
    expect(placeAsked()).toBe('');
    expect(screen.queryByTestId('place-filter')).toBeNull();

    act(() => showPlace.current('Garmisch'));

    expect(placeAsked()).toBe('Garmisch');
    expect(
      screen.getByRole('group', { name: 'Place filter' }),
    ).toHaveTextContent('Garmisch');
  });

  it('shows every place again on ×', async () => {
    renderList();
    act(() => showPlace.current('Garmisch'));

    await userEvent.click(
      screen.getByRole('button', { name: 'Show every place' }),
    );

    expect(placeAsked()).toBe('');
    expect(screen.queryByTestId('place-filter')).toBeNull();
  });

  it('announces how many entries are at the place', () => {
    useItemsMock.mockReturnValue(
      itemsState({ items: [item('1'), item('2')], total: 2 }),
    );
    renderList();

    act(() => showPlace.current('Garmisch'));

    expect(screen.getByTestId('search-status')).toHaveTextContent('2 results');
  });

  it('says there is nothing at the place, rather than nothing at all, when the list comes back empty', () => {
    useItemsMock.mockReturnValue(itemsState({ items: [], total: 0 }));
    renderList();

    act(() => showPlace.current('Garmisch'));

    expect(screen.getByTestId('empty-title')).toHaveTextContent(
      'No entries at Garmisch',
    );
    expect(
      screen.getByText('Show every place to see all the entries again.'),
    ).toBeVisible();
  });
});
