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
    it('does nothing and clears the list when there is no category', async () => {
      const { result } = renderHook(() => useShares(null), { wrapper });

      let list: unknown;
      await act(async () => {
        list = await result.current.reload();
      });

      expect(list).toEqual([]);
      expect(listSharesForCategory).not.toHaveBeenCalled();
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

    it('surfaces an error rather than throwing, leaving the list empty', async () => {
      vi.mocked(listSharesForCategory).mockResolvedValue({
        data: null,
        error: new Error('boom'),
      } as never);
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });

      let list: unknown;
      await act(async () => {
        list = await result.current.reload();
      });

      expect(list).toEqual([]);
      expect(result.current.shares).toEqual([]);
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

    it('reports failure without adding anything to the list', async () => {
      vi.mocked(createShareRow).mockResolvedValue({
        data: null,
        error: new Error('cannot share a category with yourself'),
      } as never);
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.createShare('owner@example.com', null);
      });

      expect(ok).toBe(false);
      expect(result.current.shares).toEqual([]);
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

    it('leaves the list untouched when the update fails', async () => {
      vi.mocked(listSharesForCategory).mockResolvedValue({
        data: [grant],
        error: null,
      } as never);
      vi.mocked(updateShareRoleRow).mockResolvedValue({
        data: null,
        error: new Error('boom'),
      } as never);
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
        result.current.deleteShare('share-1', {
          successMessage: 'Removed.',
          errorMessage: 'Could not remove.',
        });
      });

      expect(result.current.shares).toEqual([{ ...grant, id: 'share-2' }]);
      await commitDeferredDelete();

      await waitFor(() =>
        expect(deleteShareRow).toHaveBeenCalledWith('share-1'),
      );
      expect(result.current.shares).toEqual([{ ...grant, id: 'share-2' }]);
    });

    it('restores the grant when the deferred delete fails', async () => {
      vi.mocked(listSharesForCategory).mockResolvedValue({
        data: [grant],
        error: null,
      } as never);
      vi.mocked(deleteShareRow).mockResolvedValue({
        error: new Error('boom'),
      } as never);
      vi.spyOn(console, 'error').mockImplementation(() => {});
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
