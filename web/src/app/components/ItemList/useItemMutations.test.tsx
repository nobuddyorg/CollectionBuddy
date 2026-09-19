// @vitest-environment jsdom
import { useState } from 'react';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { deleteItem, updateItem } from '../../data/items';
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

// removeItem's own confirm() call is what stands between "clicked delete"
// and the optimistic removal -- exercised for real here (a real
// ConfirmProvider, a real click on its accept button) rather than mocked
// away, since the index-capture-before-removal ordering this file is
// about only exists on the other side of that await.
async function acceptDeleteConfirmation() {
  await userEvent.click(await screen.findByTestId('confirm-accept'));
}

// The actual deleteItem call is deferred to the toast's undo window --
// closing the toast (the same as letting it auto-dismiss) is what commits
// it, so tests exercising the deferred delete need to trigger that
// themselves rather than waiting on it.
async function commitDeferredDelete() {
  await screen.findByRole('status');
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
}

// items lives as the harness's own state, not a variable the test mutates
// by hand -- removeItem/setItems close over whatever `items` was on the
// render that created them, so a stand-in that doesn't actually re-render
// on setItems would let a stale closure pass by never observing it.
function useHarness(
  initial: ItemLite[],
  captureItemImagePaths: (
    itemId: string,
  ) => Promise<{ path_full: string; path_thumb: string | null }[]>,
  removeImageBytes: (
    itemId: string,
    paths: { path_full: string; path_thumb: string | null }[],
  ) => Promise<void>,
  reload: (opts?: { silent?: boolean }) => Promise<void>,
) {
  const [items, setItems] = useState<ItemLite[]>(initial);
  const mutations = useItemMutations({
    items,
    setItems,
    reload,
    captureItemImagePaths,
    removeImageBytes,
  });
  return { items, setItems, ...mutations };
}

describe('useItemMutations removeItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
  });

  it('names the entry in the confirmation and the success toast', async () => {
    const { result } = renderHook(
      () => useHarness([item('a')], vi.fn(), vi.fn(), vi.fn()),
      { wrapper },
    );

    act(() => {
      void result.current.removeItem('a');
    });

    expect(
      await screen.findByText(
        'Delete this entry? It and every one of its photographs will be permanently deleted.',
      ),
    ).toBeInTheDocument();

    await acceptDeleteConfirmation();

    expect(await screen.findByText('Entry deleted.')).toBeInTheDocument();
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
    const captureItemImagePaths = vi.fn().mockResolvedValue([]);
    const removeImageBytes = vi.fn();
    const reload = vi.fn();
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { result } = renderHook(
      () =>
        useHarness(
          [item('a'), item('b'), item('c')],
          captureItemImagePaths,
          removeImageBytes,
          reload,
        ),
      { wrapper },
    );

    act(() => {
      void result.current.removeItem('b');
    });
    await acceptDeleteConfirmation();
    await commitDeferredDelete();

    await screen.findByRole('alert');
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not delete this entry. Please try again.',
    );
    // The paths were captured (a read, harmless either way), but the row
    // was never actually deleted, so nothing that acts on them should have
    // run: no byte removal, no resync of the page.
    expect(captureItemImagePaths).toHaveBeenCalledWith('b');
    expect(removeImageBytes).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('delete item', expect.anything());
    consoleError.mockRestore();
  });

  // deleteItem succeeding is the point of no return: the row is gone,
  // irreversibly, before removeImageBytes is ever called. A cleanup
  // failure here is a storage leak, not data loss -- there is no entry
  // left to restore, and restoring one would resurrect a card the
  // database no longer has.
  it('does not restore the item when deleteItem succeeds but image cleanup fails', async () => {
    vi.mocked(deleteItem).mockResolvedValue({ error: null } as never);
    const capturedPaths = [{ path_full: 'b/a.webp', path_thumb: null }];
    const captureItemImagePaths = vi.fn().mockResolvedValue(capturedPaths);
    const removeImageBytes = vi
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
          captureItemImagePaths,
          removeImageBytes,
          reload,
        ),
      { wrapper },
    );

    act(() => {
      void result.current.removeItem('b');
    });
    await acceptDeleteConfirmation();
    await commitDeferredDelete();

    await screen.findByRole('alert');
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'c']);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'This entry was deleted, but its photographs could not be removed and may still count against your storage.',
    );
    expect(removeImageBytes).toHaveBeenCalledWith('b', capturedPaths);
    expect(reload).toHaveBeenCalledWith({ silent: true });
    expect(consoleError).toHaveBeenCalledWith(
      'delete item images',
      expect.anything(),
    );
    consoleError.mockRestore();
  });

  it('calls whichever reload function is current after a re-render, not a stale one', async () => {
    vi.mocked(deleteItem).mockResolvedValue({ error: null } as never);
    const staleReload = vi.fn();
    const freshReload = vi.fn();
    const captureItemImagePaths = vi.fn().mockResolvedValue([]);
    const removeImageBytes = vi.fn().mockResolvedValue(undefined);

    const { result, rerender } = renderHook(
      (props: { reload: (opts?: { silent?: boolean }) => Promise<void> }) =>
        useItemMutations({
          items: [item('a')],
          setItems: vi.fn(),
          reload: props.reload,
          captureItemImagePaths,
          removeImageBytes,
        }),
      { wrapper, initialProps: { reload: staleReload } },
    );

    rerender({ reload: freshReload });

    act(() => {
      void result.current.removeItem('a');
    });
    await acceptDeleteConfirmation();
    await commitDeferredDelete();

    await vi.waitFor(() =>
      expect(freshReload).toHaveBeenCalledWith({ silent: true }),
    );
    expect(staleReload).not.toHaveBeenCalled();
  });

  // The index is captured before the optimistic removal specifically so a
  // cancelled confirmation -- which never removes anything -- has nothing
  // to undo. Guards the early return actually being early: no read, no
  // network call, and no optimistic removal should fire at all.
  it('removes nothing and calls deleteItem for nothing when the confirmation is declined', async () => {
    const captureItemImagePaths = vi.fn();
    const removeImageBytes = vi.fn();
    const reload = vi.fn();

    const { result } = renderHook(
      () =>
        useHarness(
          [item('a'), item('b')],
          captureItemImagePaths,
          removeImageBytes,
          reload,
        ),
      { wrapper },
    );

    act(() => {
      void result.current.removeItem('a');
    });
    await userEvent.click(await screen.findByTestId('confirm-cancel'));

    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(captureItemImagePaths).not.toHaveBeenCalled();
    expect(deleteItem).not.toHaveBeenCalled();
  });

  // The regression this guards against: the real deleteItem() call is
  // deferred to the toast's undo window (AUTO_DISMISS_MS, several seconds),
  // so a reload that lands in that window -- e.g. the search box clearing
  // right after the confirm click -- reports the row exactly as the
  // database still has it. Applying that response verbatim would resurrect
  // a card the user just watched disappear.
  it('keeps a just-deleted card out of the list even when a reload reports it before the deferred delete actually runs', async () => {
    const captureItemImagePaths = vi.fn().mockResolvedValue([]);
    const removeImageBytes = vi.fn();
    const reload = vi.fn();

    const { result } = renderHook(
      () =>
        useHarness(
          [item('a'), item('b')],
          captureItemImagePaths,
          removeImageBytes,
          reload,
        ),
      { wrapper },
    );

    act(() => {
      void result.current.removeItem('a');
    });
    await acceptDeleteConfirmation();
    expect(result.current.items.map((i) => i.id)).toEqual(['b']);

    // Stands in for useItems' own load() overwriting `items` with a fresh
    // server response that still contains the row.
    act(() => {
      result.current.setItems([item('a'), item('b')]);
    });

    await waitFor(() =>
      expect(result.current.items.map((i) => i.id)).toEqual(['b']),
    );
  });

  // Nothing to snapshot for an id that was never in the list -- the undo
  // action must not throw trying to restore it.
  it('does nothing to restore when undo is pressed for an id that was never in the list', async () => {
    vi.mocked(deleteItem).mockResolvedValue({ error: null } as never);
    const captureItemImagePaths = vi.fn().mockResolvedValue([]);
    const removeImageBytes = vi.fn();
    const reload = vi.fn();

    const { result } = renderHook(
      () =>
        useHarness(
          [item('a')],
          captureItemImagePaths,
          removeImageBytes,
          reload,
        ),
      { wrapper },
    );

    act(() => {
      void result.current.removeItem('missing');
    });
    await acceptDeleteConfirmation();

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(result.current.items.map((i) => i.id)).toEqual(['a']);
  });
});

describe('useItemMutations saveEdit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
  });

  function noopHarness(initial: ItemLite[]) {
    return renderHook(
      () =>
        useHarness(initial, vi.fn().mockResolvedValue([]), vi.fn(), vi.fn()),
      { wrapper },
    );
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

    const { result } = noopHarness([item('a'), item('b'), item('c')]);

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.saveEdit('b', {
        ...EMPTY_ITEM_FORM_VALUES,
        title: 'Updated title',
      });
    });

    expect(ok).toBe(true);
    expect(result.current.items.map((i) => i.title)).toEqual([
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

    const { result } = noopHarness([item('a'), item('b')]);

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.saveEdit('b', EMPTY_ITEM_FORM_VALUES);
    });

    expect(ok).toBe(false);
    expect(result.current.items.map((i) => i.id)).toEqual(['a', 'b']);
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

    const { result } = noopHarness([item('a')]);

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
    let resolveUpdate: (v: unknown) => void = () => {};
    vi.mocked(updateItem).mockReturnValue(
      new Promise((resolve) => {
        resolveUpdate = resolve;
      }) as never,
    );

    const { result } = noopHarness([item('a')]);

    let first!: Promise<boolean>;
    let firstDone = false;
    // A plain (non-async) act callback flushes the synchronous portion of
    // saveEdit -- up to its first `await` -- including the setIsSaving(true)
    // that commits before the call returns, so the closure `saveEdit` reads
    // on the next line already sees isSaving: true.
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
