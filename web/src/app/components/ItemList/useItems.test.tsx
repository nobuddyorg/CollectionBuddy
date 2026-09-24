// @vitest-environment jsdom
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useItems } from './useItems';
import { page, resetItemsTestState, wrapper } from './useItems.test-support';
import type { listItems } from '../../data/items';

const { listItemsMock } = vi.hoisted(() => ({ listItemsMock: vi.fn() }));

vi.mock('../../data/items', () => ({
  listItems: (...args: unknown[]) =>
    listItemsMock(...args) as ReturnType<typeof listItems>,
}));

describe('useItems', () => {
  beforeEach(() => {
    resetItemsTestState(listItemsMock);
  });

  it('reports a failed listing rather than throwing', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const listError = new Error('rls');
    listItemsMock.mockResolvedValue({
      data: null,
      error: listError,
      count: 0,
    });

    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Search failed. Please try again.',
    );
    expect(consoleError).toHaveBeenCalledWith('load items', listError);
    consoleError.mockRestore();
  });

  it('treats a null items answer as an empty page', async () => {
    listItemsMock.mockResolvedValue({ data: null, error: null, count: 0 });

    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items).toEqual([]);
  });

  it('falls back to an empty tag list for a row with none', async () => {
    listItemsMock.mockResolvedValue({
      data: [
        {
          id: 'coin-1',
          title: 'Denarius',
          description: null,
          place: null,
          place_lat: null,
          place_lng: null,
          tags: undefined,
        },
      ],
      error: null,
      count: 1,
    });

    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items[0]?.tags).toEqual([]);
  });

  it('keeps whatever place and coordinates a row actually has, not just its nulls', async () => {
    listItemsMock.mockResolvedValue({
      data: [
        {
          id: 'coin-1',
          title: 'Denarius',
          description: null,
          place: 'Rome',
          place_lat: 41.9,
          place_lng: 12.5,
          tags: [],
        },
      ],
      error: null,
      count: 1,
    });

    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.items[0]).toMatchObject({
      place: 'Rome',
      place_lat: 41.9,
      place_lng: 12.5,
    });
  });

  it('trims the search term before sending it', async () => {
    listItemsMock.mockResolvedValue(page([]));

    renderHook(() => useItems('cat1', '  coin  '), { wrapper });

    await waitFor(() =>
      expect(listItemsMock).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'coin' }),
      ),
    );
  });

  it('starts loading immediately, before the first request settles', () => {
    listItemsMock.mockReturnValue(new Promise(() => {}));

    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });

    expect(result.current.loading).toBe(true);
  });

  // The mount effect raises `loading` itself, so this looks at the render pass that reaches the screen first.
  it('paints its very first render already loading, never flashing the empty-category state', () => {
    listItemsMock.mockReturnValue(new Promise(() => {}));
    const passes: boolean[] = [];
    function Probe() {
      passes.push(useItems('cat1', '').loading);
      return null;
    }

    render(<Probe />, { wrapper });

    expect(passes[0]).toBe(true);
  });

  it('resets to page 1 when the search term changes while on a later page', async () => {
    listItemsMock.mockResolvedValue(page([{ id: 'a' }], 30));

    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => useItems('cat1', query),
      { wrapper, initialProps: { query: '' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(2));
    expect(result.current.page).toBe(2);

    rerender({ query: 'coin' });

    expect(result.current.page).toBe(1);
  });

  it('resets to page 1 when the category changes while on a later page', async () => {
    listItemsMock.mockResolvedValue(page([{ id: 'a' }], 30));

    const { result, rerender } = renderHook(
      ({ categoryId }: { categoryId: string }) => useItems(categoryId, ''),
      { wrapper, initialProps: { categoryId: 'cat1' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(2));
    expect(result.current.page).toBe(2);

    rerender({ categoryId: 'cat2' });

    expect(result.current.page).toBe(1);
  });

  it('stays on the same page across a re-render that changes neither category nor search', async () => {
    listItemsMock.mockResolvedValue(page([{ id: 'a' }], 30));

    const { result, rerender } = renderHook(
      ({ query }: { query: string }) => useItems('cat1', query),
      { wrapper, initialProps: { query: 'coin' } },
    );
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setPage(2));
    rerender({ query: 'coin' });

    expect(result.current.page).toBe(2);
  });

  it('treats a null count as zero rather than crashing', async () => {
    listItemsMock.mockResolvedValue({
      data: [],
      error: null,
      count: null,
    });

    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.total).toBe(0);
  });

  it('totals zero pages for an empty category rather than reporting one empty page', async () => {
    listItemsMock.mockResolvedValue(page([], 0));

    const { result } = renderHook(() => useItems('cat1', ''), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.totalPages).toBe(0);
  });
});
