// @vitest-environment jsdom
import { useState } from 'react';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
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

// A real ConfirmProvider, not a mock: the index-capture-before-removal ordering lives past that await.
async function acceptDeleteConfirmation() {
  await userEvent.click(await screen.findByTestId('confirm-accept'));
}

// deleteItem is deferred to the toast's undo window; closing the toast commits it, the same as expiry.
async function commitDeferredDelete() {
  await screen.findByRole('status');
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
}

type Collaborators = Omit<
  Parameters<typeof useItemMutations>[0],
  'items' | 'setItems'
>;

// `items` is the harness's own state, so a stale closure over it can't pass by never re-rendering.
function useHarness({
  initial,
  ...collaborators
}: Collaborators & { initial: ItemLite[] }) {
  const [items, setItems] = useState<ItemLite[]>(initial);
  const mutations = useItemMutations({ items, setItems, ...collaborators });
  return { items, setItems, ...mutations };
}

function noopCollaborators(): Collaborators {
  return {
    captureItemImagePaths: vi.fn(),
    removeImageBytes: vi.fn(),
    reload: vi.fn(),
  };
}

describe('useItemMutations removeItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
  });

  it('names the entry in the confirmation and the success toast', async () => {
    const { result } = renderHook(
      () => useHarness({ initial: [item('a')], ...noopCollaborators() }),
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

  // Only a middle card tells restoring to "index 1 of 3" apart from pushing the snapshot onto the end.
  it('puts the deleted item back at its original index, not the end, when deleteItem fails', async () => {
    vi.mocked(deleteItem).mockResolvedValue({
      error: new Error('offline'),
    } as never);
    const collaborators = {
      captureItemImagePaths: vi.fn().mockResolvedValue([]),
      removeImageBytes: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn(),
    };
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { result } = renderHook(
      () =>
        useHarness({
          initial: [item('a'), item('b'), item('c')],
          ...collaborators,
        }),
      { wrapper },
    );

    act(() => {
      void result.current.removeItem('b');
    });
    await acceptDeleteConfirmation();
    await commitDeferredDelete();

    await screen.findByRole('alert');
    expect(result.current.items.map((entry) => entry.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not delete this entry. Please try again.',
    );
    // The objects went first; the row is still there, so the restore shows what the database has.
    expect(collaborators.captureItemImagePaths).toHaveBeenCalledWith('b');
    expect(collaborators.removeImageBytes).toHaveBeenCalledWith('b', []);
    expect(collaborators.reload).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('delete item', expect.anything());
    consoleError.mockRestore();
  });
  it('removes the photographs before the row, and restores the entry without deleting the row when that fails', async () => {
    vi.mocked(deleteItem).mockResolvedValue({ error: null } as never);
    const capturedPaths = [{ path_full: 'b/a.webp', path_thumb: null }];
    const collaborators = {
      captureItemImagePaths: vi.fn().mockResolvedValue(capturedPaths),
      removeImageBytes: vi.fn().mockRejectedValue(new Error('storage down')),
      reload: vi.fn().mockResolvedValue(undefined),
    };
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { result } = renderHook(
      () =>
        useHarness({
          initial: [item('a'), item('b'), item('c')],
          ...collaborators,
        }),
      { wrapper },
    );

    act(() => {
      void result.current.removeItem('b');
    });
    await acceptDeleteConfirmation();
    await commitDeferredDelete();

    await screen.findByRole('alert');
    expect(result.current.items.map((entry) => entry.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not delete this entry. Please try again.',
    );
    expect(collaborators.removeImageBytes).toHaveBeenCalledWith(
      'b',
      capturedPaths,
    );
    expect(deleteItem).not.toHaveBeenCalled();
    expect(collaborators.reload).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledWith('delete item', expect.anything());
    consoleError.mockRestore();
  });

  it('deletes the row only after every photograph object is gone', async () => {
    vi.mocked(deleteItem).mockResolvedValue({ error: null } as never);
    const capturedPaths = [{ path_full: 'b/a.webp', path_thumb: null }];
    const collaborators = {
      captureItemImagePaths: vi.fn().mockResolvedValue(capturedPaths),
      removeImageBytes: vi.fn().mockResolvedValue(undefined),
      reload: vi.fn().mockResolvedValue(undefined),
    };

    const { result } = renderHook(
      () =>
        useHarness({
          initial: [item('a'), item('b'), item('c')],
          ...collaborators,
        }),
      { wrapper },
    );

    act(() => {
      void result.current.removeItem('b');
    });
    await acceptDeleteConfirmation();
    await commitDeferredDelete();

    await waitFor(() => expect(deleteItem).toHaveBeenCalledWith('b'));
    expect(result.current.items.map((entry) => entry.id)).toEqual(['a', 'c']);
    const removeOrder =
      collaborators.removeImageBytes.mock.invocationCallOrder[0];
    const rowOrder = vi.mocked(deleteItem).mock.invocationCallOrder[0];
    expect(removeOrder).toBeLessThan(rowOrder);
    expect(collaborators.reload).toHaveBeenCalledWith({ silent: true });
  });
  it('calls whichever reload function is current after a re-render, not a stale one', async () => {
    vi.mocked(deleteItem).mockResolvedValue({ error: null } as never);
    const staleReload = vi.fn();
    const freshReload = vi.fn();
    const captureItemImagePaths = vi.fn().mockResolvedValue([]);
    const removeImageBytes = vi.fn().mockResolvedValue(undefined);

    const { result, rerender } = renderHook(
      (props: { reload: Collaborators['reload'] }) =>
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

  // A cancelled confirmation removes nothing, so there must be no read, no network call, no removal.
  it('removes nothing and calls deleteItem for nothing when the confirmation is declined', async () => {
    const collaborators = noopCollaborators();

    const { result } = renderHook(
      () => useHarness({ initial: [item('a'), item('b')], ...collaborators }),
      { wrapper },
    );

    act(() => {
      void result.current.removeItem('a');
    });
    await userEvent.click(await screen.findByTestId('confirm-cancel'));

    expect(result.current.items.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(collaborators.captureItemImagePaths).not.toHaveBeenCalled();
    expect(deleteItem).not.toHaveBeenCalled();
  });

  // deleteItem() is deferred behind the undo window, so a stale reload can report the row as still there.
  it('keeps a just-deleted card out of the list even when a reload reports it before the deferred delete actually runs', async () => {
    const { result } = renderHook(
      () =>
        useHarness({
          initial: [item('a'), item('b')],
          ...noopCollaborators(),
          captureItemImagePaths: vi.fn().mockResolvedValue([]),
        }),
      { wrapper },
    );

    act(() => {
      void result.current.removeItem('a');
    });
    await acceptDeleteConfirmation();
    expect(result.current.items.map((entry) => entry.id)).toEqual(['b']);

    // Stands in for useItems' own load() overwriting `items` with a response that still has the row.
    act(() => {
      result.current.setItems([item('a'), item('b')]);
    });

    await waitFor(() =>
      expect(result.current.items.map((entry) => entry.id)).toEqual(['b']),
    );
  });

  // Nothing to snapshot for an id never in the list; undo must not throw trying to restore it.
  it('does nothing to restore when undo is pressed for an id that was never in the list', async () => {
    vi.mocked(deleteItem).mockResolvedValue({ error: null } as never);

    const { result } = renderHook(
      () =>
        useHarness({
          initial: [item('a')],
          ...noopCollaborators(),
          captureItemImagePaths: vi.fn().mockResolvedValue([]),
        }),
      { wrapper },
    );

    act(() => {
      void result.current.removeItem('missing');
    });
    await acceptDeleteConfirmation();

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));
    expect(result.current.items.map((entry) => entry.id)).toEqual(['a']);
  });
});
