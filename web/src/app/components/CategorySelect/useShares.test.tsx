// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import {
  createShare as createShareRow,
  deleteShare as deleteShareRow,
  listSharesForCategory,
  updateShareRole as updateShareRoleRow,
} from '../../data/shares';
import { useShares } from './useShares';

vi.mock('../../data/shares', () => ({
  createShare: vi.fn(),
  deleteShare: vi.fn(),
  listSharesForCategory: vi.fn(),
  updateShareRole: vi.fn(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

const grant = {
  id: 'share-1',
  invited_email: 'grantee@example.com',
  expires_at: null,
  owner_user_id: 'owner-1',
  role: 'viewer' as const,
};

describe('useShares', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
  });

  describe('reload', () => {
    it('starts idle, with no grants and not loading', () => {
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });

      expect(result.current.shares).toEqual([]);
      expect(result.current.isLoading).toBe(false);
    });

    it('does nothing and clears the list when there is no category', async () => {
      const { result } = renderHook(() => useShares(null), { wrapper });

      let list: unknown;
      await act(async () => {
        list = await result.current.reload();
      });

      expect(list).toEqual([]);
      expect(result.current.shares).toEqual([]);
      expect(listSharesForCategory).not.toHaveBeenCalled();
    });

    it('clears out whatever grants were previously loaded once the category goes away', async () => {
      vi.mocked(listSharesForCategory).mockResolvedValue({
        data: [grant],
        error: null,
      } as never);
      const { result, rerender } = renderHook<
        ReturnType<typeof useShares>,
        { categoryId: string | null }
      >(({ categoryId }) => useShares(categoryId), {
        wrapper,
        initialProps: { categoryId: 'cat-1' },
      });
      await act(async () => {
        await result.current.reload();
      });
      expect(result.current.shares).toEqual([grant]);

      rerender({ categoryId: null });
      await act(async () => {
        await result.current.reload();
      });

      expect(result.current.shares).toEqual([]);
    });

    it('is loading while the request is in flight, and done once it settles', async () => {
      let release: (value: unknown) => void = () => {};
      vi.mocked(listSharesForCategory).mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        }) as never,
      );
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });

      act(() => {
        void result.current.reload();
      });
      await waitFor(() => expect(result.current.isLoading).toBe(true));

      await act(async () => {
        release({ data: [], error: null });
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('loads the grants for the given category', async () => {
      vi.mocked(listSharesForCategory).mockResolvedValue({
        data: [grant],
        error: null,
      } as never);
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });

      await act(async () => {
        await result.current.reload();
      });

      expect(listSharesForCategory).toHaveBeenCalledWith('cat-1');
      expect(result.current.shares).toEqual([grant]);
    });

    it('falls back to an empty list when the server returns no rows', async () => {
      vi.mocked(listSharesForCategory).mockResolvedValue({
        data: null,
        error: null,
      } as never);
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });

      let list: unknown;
      await act(async () => {
        list = await result.current.reload();
      });

      expect(list).toEqual([]);
      expect(result.current.shares).toEqual([]);
    });

    it('surfaces an error rather than throwing, leaving the list empty', async () => {
      const loadError = new Error('boom');
      vi.mocked(listSharesForCategory).mockResolvedValue({
        data: null,
        error: loadError,
      } as never);
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });

      let list: unknown;
      await act(async () => {
        list = await result.current.reload();
      });

      expect(list).toEqual([]);
      expect(result.current.shares).toEqual([]);
      expect(result.current.isLoading).toBe(false);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not load sharing. Please try again.',
      );
      expect(consoleError).toHaveBeenCalledWith('reload shares', loadError);
      consoleError.mockRestore();
    });
  });

  describe('createShare', () => {
    it('appends the row the server returned to the list', async () => {
      vi.mocked(createShareRow).mockResolvedValue({
        data: grant,
        error: null,
      } as never);
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.createShare('grantee@example.com', null);
      });

      expect(ok).toBe(true);
      expect(createShareRow).toHaveBeenCalledWith(
        'cat-1',
        'grantee@example.com',
        null,
      );
      expect(result.current.shares).toEqual([grant]);
    });

    it('succeeds without changing the list when the server returns no row', async () => {
      vi.mocked(createShareRow).mockResolvedValue({
        data: null,
        error: null,
      } as never);
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.createShare('grantee@example.com', null);
      });

      expect(ok).toBe(true);
      expect(result.current.shares).toEqual([]);
    });

    it('reports failure without adding anything to the list', async () => {
      const shareError = new Error('cannot share a category with yourself');
      vi.mocked(createShareRow).mockResolvedValue({
        data: null,
        error: shareError,
      } as never);
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.createShare('owner@example.com', null);
      });

      expect(ok).toBe(false);
      expect(result.current.shares).toEqual([]);
      expect(result.current.isSharing).toBe(false);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not share this collection. Please try again.',
      );
      expect(consoleError).toHaveBeenCalledWith('create share', shareError);
      consoleError.mockRestore();
    });

    it('announces success with the expected text', async () => {
      vi.mocked(createShareRow).mockResolvedValue({
        data: grant,
        error: null,
      } as never);
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });

      await act(async () => {
        await result.current.createShare('grantee@example.com', null);
      });

      expect(await screen.findByText('Collection shared.')).toBeInTheDocument();
    });
  });

  describe('updateShareRole', () => {
    it("replaces the grant with the server's row on success", async () => {
      vi.mocked(listSharesForCategory).mockResolvedValue({
        data: [grant],
        error: null,
      } as never);
      const updated = { ...grant, role: 'editor' as const };
      vi.mocked(updateShareRoleRow).mockResolvedValue({
        data: updated,
        error: null,
      } as never);
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });
      await act(async () => {
        await result.current.reload();
      });

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.updateShareRole('share-1', 'editor');
      });

      expect(ok).toBe(true);
      expect(updateShareRoleRow).toHaveBeenCalledWith('share-1', 'editor');
      expect(result.current.shares).toEqual([updated]);
    });

    it('succeeds without changing the list when the server returns no row', async () => {
      vi.mocked(listSharesForCategory).mockResolvedValue({
        data: [grant],
        error: null,
      } as never);
      vi.mocked(updateShareRoleRow).mockResolvedValue({
        data: null,
        error: null,
      } as never);
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });
      await act(async () => {
        await result.current.reload();
      });

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.updateShareRole('share-1', 'editor');
      });

      expect(ok).toBe(true);
      expect(result.current.shares).toEqual([grant]);
    });

    it('replaces only the targeted grant, leaving the others as they were', async () => {
      const other = {
        ...grant,
        id: 'share-2',
        invited_email: 'other@example.com',
      };
      vi.mocked(listSharesForCategory).mockResolvedValue({
        data: [grant, other],
        error: null,
      } as never);
      const updated = { ...grant, role: 'editor' as const };
      vi.mocked(updateShareRoleRow).mockResolvedValue({
        data: updated,
        error: null,
      } as never);
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });
      await act(async () => {
        await result.current.reload();
      });

      await act(async () => {
        await result.current.updateShareRole('share-1', 'editor');
      });

      expect(result.current.shares).toEqual([updated, other]);
    });

    it('leaves the list untouched when the update fails', async () => {
      vi.mocked(listSharesForCategory).mockResolvedValue({
        data: [grant],
        error: null,
      } as never);
      const updateError = new Error('boom');
      vi.mocked(updateShareRoleRow).mockResolvedValue({
        data: null,
        error: updateError,
      } as never);
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });
      await act(async () => {
        await result.current.reload();
      });

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.updateShareRole('share-1', 'editor');
      });

      expect(ok).toBe(false);
      expect(result.current.shares).toEqual([grant]);
      expect(result.current.isUpdatingRole).toBe(false);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        "Could not update this share's access. Please try again.",
      );
      expect(consoleError).toHaveBeenCalledWith(
        'update share role',
        updateError,
      );
      consoleError.mockRestore();
    });
  });

  describe('deleteShare', () => {
    // The row disappears from the list the moment deleteShare is called;
    // the actual deleteShareRow call is deferred to the toast's undo
    // window (see useToast), committed here by closing the toast.
    async function commitDeferredDelete() {
      await screen.findByRole('status');
      await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    }

    it('removes exactly the deleted grant from the list', async () => {
      vi.mocked(listSharesForCategory).mockResolvedValue({
        data: [grant, { ...grant, id: 'share-2' }],
        error: null,
      } as never);
      vi.mocked(deleteShareRow).mockResolvedValue({ error: null } as never);
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });
      await act(async () => {
        await result.current.reload();
      });

      act(() => {
        result.current.deleteShare('share-2', {
          successMessage: 'Removed.',
          errorMessage: 'Could not remove.',
        });
      });

      expect(result.current.shares).toEqual([grant]);
      expect(screen.getByRole('status')).toHaveTextContent('Removed.');
      await commitDeferredDelete();

      await waitFor(() =>
        expect(deleteShareRow).toHaveBeenCalledWith('share-2'),
      );
      expect(result.current.shares).toEqual([grant]);
      expect(result.current.isRevoking).toBe(false);
    });

    it('puts the grant back in its original position when undo is used', async () => {
      vi.mocked(listSharesForCategory).mockResolvedValue({
        data: [grant, { ...grant, id: 'share-2' }],
        error: null,
      } as never);
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });
      await act(async () => {
        await result.current.reload();
      });

      act(() => {
        result.current.deleteShare('share-1', {
          successMessage: 'Removed.',
          errorMessage: 'Could not remove.',
        });
      });
      expect(result.current.shares).toEqual([{ ...grant, id: 'share-2' }]);

      await userEvent.click(
        await screen.findByRole('button', { name: 'Undo' }),
      );

      expect(result.current.shares).toEqual([
        grant,
        { ...grant, id: 'share-2' },
      ]);
      expect(deleteShareRow).not.toHaveBeenCalled();
    });

    it('restores the grant when the deferred delete fails', async () => {
      vi.mocked(listSharesForCategory).mockResolvedValue({
        data: [grant],
        error: null,
      } as never);
      const deleteError = new Error('boom');
      vi.mocked(deleteShareRow).mockResolvedValue({
        error: deleteError,
      } as never);
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });
      await act(async () => {
        await result.current.reload();
      });

      act(() => {
        result.current.deleteShare('share-1', {
          successMessage: 'Removed.',
          errorMessage: 'Could not remove.',
        });
      });

      expect(result.current.shares).toEqual([]);
      await commitDeferredDelete();

      await waitFor(() => expect(result.current.shares).toEqual([grant]));
      expect(consoleError).toHaveBeenCalledWith('delete share', deleteError);
      expect(await screen.findByText('Could not remove.')).toBeInTheDocument();
      expect(result.current.isRevoking).toBe(false);
      consoleError.mockRestore();
    });

    it('does nothing for a grant that is not in the list', async () => {
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });

      act(() => {
        result.current.deleteShare('share-nope', {
          successMessage: 'Removed.',
          errorMessage: 'Could not remove.',
        });
      });

      expect(deleteShareRow).not.toHaveBeenCalled();
    });
  });

  // Each of these is one request at a time: the second click of a
  // double-click must not issue a second grant, a second role write, or a
  // second delete.
  describe('one request at a time', () => {
    it('ignores a second invite while the first is still in flight', async () => {
      let release: (() => void) | undefined;
      vi.mocked(createShareRow).mockReturnValue(
        new Promise((resolve) => {
          release = () => resolve({ data: grant, error: null });
        }) as never,
      );
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });

      act(() => {
        void result.current.createShare('a@example.com', null);
      });
      await waitFor(() => expect(result.current.isSharing).toBe(true));
      await act(async () => {
        await expect(
          result.current.createShare('b@example.com', null),
        ).resolves.toBe(false);
      });

      expect(createShareRow).toHaveBeenCalledTimes(1);
      await act(async () => {
        release?.();
      });
    });

    it('ignores a second role change while the first is still in flight', async () => {
      let release: (() => void) | undefined;
      vi.mocked(updateShareRoleRow).mockReturnValue(
        new Promise((resolve) => {
          release = () => resolve({ data: grant, error: null });
        }) as never,
      );
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });

      act(() => {
        void result.current.updateShareRole('share-1', 'editor');
      });
      await waitFor(() => expect(result.current.isUpdatingRole).toBe(true));
      await act(async () => {
        await expect(
          result.current.updateShareRole('share-1', 'viewer'),
        ).resolves.toBe(false);
      });

      expect(updateShareRoleRow).toHaveBeenCalledTimes(1);
      await act(async () => {
        release?.();
      });
    });

    it('ignores a second revoke of a different grant while one is still deferred', async () => {
      vi.mocked(listSharesForCategory).mockResolvedValue({
        data: [grant, { ...grant, id: 'share-2' }],
        error: null,
      } as never);
      let release: (() => void) | undefined;
      vi.mocked(deleteShareRow).mockReturnValue(
        new Promise((resolve) => {
          release = () => resolve({ error: null });
        }) as never,
      );
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });
      await act(async () => {
        await result.current.reload();
      });

      act(() => {
        result.current.deleteShare('share-1', {
          successMessage: 'Removed.',
          errorMessage: 'Could not remove.',
        });
      });
      await screen.findByRole('status');
      await userEvent.click(screen.getByRole('button', { name: 'Close' }));
      await waitFor(() => expect(result.current.isRevoking).toBe(true));

      act(() => {
        result.current.deleteShare('share-2', {
          successMessage: 'Removed.',
          errorMessage: 'Could not remove.',
        });
      });

      expect(result.current.shares).toEqual([{ ...grant, id: 'share-2' }]);
      expect(deleteShareRow).toHaveBeenCalledTimes(1);
      await act(async () => {
        release?.();
      });
    });

    it('refuses to invite anyone when there is no category to invite them to', async () => {
      const { result } = renderHook(() => useShares(null), { wrapper });

      await act(async () => {
        await expect(
          result.current.createShare('a@example.com', null),
        ).resolves.toBe(false);
      });

      expect(createShareRow).not.toHaveBeenCalled();
    });
  });
});
