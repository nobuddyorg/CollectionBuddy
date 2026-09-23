// @vitest-environment jsdom
import { useState } from 'react';
import { act, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { updateItem } from '../../data/items';
import { useItemMutations } from './useItemMutations';
import { EMPTY_ITEM_FORM_VALUES } from '../ItemForm/types';
import type { ItemLite } from './types';

vi.mock('../../data/items', () => ({
  deleteItem: vi.fn(),
  updateItem: vi.fn(),
}));

function item(id: string): ItemLite {
  return {
    id,
    title: `Item ${id}`,
    description: null,
    place: null,
    place_lat: null,
    place_lng: null,
    tags: [],
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

// `items` is the harness's own state, so a stale closure over it can't pass by never re-rendering.
function useHarness(initial: ItemLite[]) {
  const [items, setItems] = useState<ItemLite[]>(initial);
  const mutations = useItemMutations({
    items,
    setItems,
    reload: vi.fn(),
    captureItemImagePaths: vi.fn().mockResolvedValue([]),
    removeImageBytes: vi.fn(),
  });
  return { items, setItems, ...mutations };
}

describe('useItemMutations saveEdit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
  });

  function renderHarness(initial: ItemLite[]) {
    return renderHook(() => useHarness(initial), { wrapper });
  }

  it('merges the row the server returns into the matching item and reports success', async () => {
    const updated = {
      id: 'b',
      title: 'Updated title',
      description: null,
      place: null,
      place_lat: null,
      place_lng: null,
      tags: [],
    };
    vi.mocked(updateItem).mockResolvedValue({
      data: updated,
      error: null,
    } as never);

    const { result } = renderHarness([item('a'), item('b'), item('c')]);

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.saveEdit('b', {
        ...EMPTY_ITEM_FORM_VALUES,
        title: 'Updated title',
      });
    });

    expect(ok).toBe(true);
    expect(result.current.items.map((entry) => entry.title)).toEqual([
      'Item a',
      'Updated title',
      'Item c',
    ]);
    await screen.findByText('Changes saved.');
  });

  it('leaves the list untouched and reports an error when the save fails', async () => {
    vi.mocked(updateItem).mockResolvedValue({
      data: null,
      error: new Error('offline'),
    } as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { result } = renderHarness([item('a'), item('b')]);

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.saveEdit('b', EMPTY_ITEM_FORM_VALUES);
    });

    expect(ok).toBe(false);
    expect(result.current.items.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save changes. Please try again.',
    );
    consoleError.mockRestore();
  });

  it('reports an error when the save answers with no row and no error', async () => {
    vi.mocked(updateItem).mockResolvedValue({
      data: null,
      error: null,
    } as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { result } = renderHarness([item('a')]);

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.saveEdit('a', EMPTY_ITEM_FORM_VALUES);
    });

    expect(ok).toBe(false);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save changes. Please try again.',
    );
    expect(consoleError).toHaveBeenCalledWith('save item', null);
    expect(result.current.isSaving).toBe(false);
    consoleError.mockRestore();
  });

  it('does not overlap a save already in flight', async () => {
    let resolveUpdate: (value: unknown) => void = () => {};
    vi.mocked(updateItem).mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }) as never,
    );

    const { result } = renderHarness([item('a')]);

    let first!: Promise<boolean>;
    let firstDone = false;
    // A plain act flushes saveEdit up to its first await, so the next call already sees isSaving: true.
    act(() => {
      first = result.current.saveEdit('a', EMPTY_ITEM_FORM_VALUES);
      void first.then(() => {
        firstDone = true;
      });
    });

    const second = await result.current.saveEdit('a', EMPTY_ITEM_FORM_VALUES);

    expect(second).toBe(false);
    expect(firstDone).toBe(false);

    await act(async () => {
      resolveUpdate({
        data: { id: 'a', title: 'Item a' },
        error: null,
      });
      await first;
    });
    expect(firstDone).toBe(true);
  });
});
