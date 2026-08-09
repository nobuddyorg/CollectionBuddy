// @vitest-environment jsdom
import { useState } from 'react';
import { act, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { deleteItem } from '../../data/items';
import { useItemMutations } from './useItemMutations';
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

// removeItem's own confirm() call is what stands between "clicked delete"
// and the optimistic removal -- exercised for real here (a real
// ConfirmProvider, a real click on its accept button) rather than mocked
// away, since the index-capture-before-removal ordering this file is
// about only exists on the other side of that await.
async function acceptDeleteConfirmation() {
  await userEvent.click(await screen.findByTestId('confirm-accept'));
}

// items lives as the harness's own state, not a variable the test mutates
// by hand -- removeItem/setItems close over whatever `items` was on the
// render that created them, so a stand-in that doesn't actually re-render
// on setItems would let a stale closure pass by never observing it.
function useHarness(
  initial: ItemLite[],
  deleteAllItemImages: (itemId: string) => Promise<void>,
  reload: (opts?: { silent?: boolean }) => Promise<void>,
) {
  const [items, setItems] = useState<ItemLite[]>(initial);
  const mutations = useItemMutations({
    items,
    setItems,
    reload,
    deleteAllItemImages,
  });
  return { items, ...mutations };
}

describe('useItemMutations removeItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
  });

  // The regression this guards against: capturing the index *after* the
  // optimistic removal (or just pushing the snapshot back onto the end of
  // the array) is invisible when the deleted card was last -- restoring to
  // "the end" and restoring to "index 2 of 3" produce the same array. The
  // middle card is the one case where a wrong implementation and a right
  // one visibly disagree.
  it('puts the deleted item back at its original index, not the end, when deleteItem fails', async () => {
    vi.mocked(deleteItem).mockResolvedValue({
      error: new Error('offline'),
    } as never);
    const deleteAllItemImages = vi.fn();
    const reload = vi.fn();

    const { result } = renderHook(
      () =>
        useHarness(
          [item('a'), item('b'), item('c')],
          deleteAllItemImages,
          reload,
        ),
      { wrapper },
    );

    act(() => {
      void result.current.removeItem('b');
    });
    await acceptDeleteConfirmation();

    await screen.findByRole('alert');
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not delete this entry. Please try again.',
    );
    // The row was never actually deleted, so nothing past it should have
    // run: no image cleanup, no resync of the page.
    expect(deleteAllItemImages).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  // deleteItem succeeding is the point of no return: the row is gone,
  // irreversibly, before deleteAllItemImages is ever called. A cleanup
  // failure here is a storage leak, not data loss -- there is no entry
  // left to restore, and restoring one would resurrect a card the
  // database no longer has.
  it('does not restore the item when deleteItem succeeds but image cleanup fails', async () => {
    vi.mocked(deleteItem).mockResolvedValue({ error: null } as never);
    const deleteAllItemImages = vi
      .fn()
      .mockRejectedValue(new Error('storage down'));
    const reload = vi.fn().mockResolvedValue(undefined);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { result } = renderHook(
      () =>
        useHarness(
          [item('a'), item('b'), item('c')],
          deleteAllItemImages,
          reload,
        ),
      { wrapper },
    );

    act(() => {
      void result.current.removeItem('b');
    });
    await acceptDeleteConfirmation();

    await screen.findByRole('alert');
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'c']);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This entry was deleted, but its photographs could not be removed and may still count against your storage.',
    );
    expect(reload).toHaveBeenCalledWith({ silent: true });
    consoleError.mockRestore();
  });

  // The index is captured before the optimistic removal specifically so a
  // cancelled confirmation -- which never removes anything -- has nothing
  // to undo. Guards the early return actually being early: neither the
  // network call nor the optimistic removal should fire at all.
  it('removes nothing and calls deleteItem for nothing when the confirmation is declined', async () => {
    const deleteAllItemImages = vi.fn();
    const reload = vi.fn();

    const { result } = renderHook(
      () => useHarness([item('a'), item('b')], deleteAllItemImages, reload),
      { wrapper },
    );

    act(() => {
      void result.current.removeItem('a');
    });
    await userEvent.click(await screen.findByTestId('confirm-cancel'));

    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(deleteItem).not.toHaveBeenCalled();
  });
});
