// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import {
  createShare as createShareRow,
  deleteShare as deleteShareRow,
  listSharesForCategory,
} from '../../data/shares';
import { useShares } from './useShares';

vi.mock('../../data/shares', () => ({
  createShare: vi.fn(),
  deleteShare: vi.fn(),
  listSharesForCategory: vi.fn(),
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

  describe('deleteShare', () => {
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

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.deleteShare('share-1');
      });

      expect(ok).toBe(true);
      expect(deleteShareRow).toHaveBeenCalledWith('share-1');
      expect(result.current.shares).toEqual([{ ...grant, id: 'share-2' }]);
    });

    it('leaves the list untouched when the delete fails', async () => {
      vi.mocked(listSharesForCategory).mockResolvedValue({
        data: [grant],
        error: null,
      } as never);
      vi.mocked(deleteShareRow).mockResolvedValue({
        error: new Error('boom'),
      } as never);
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });
      await act(async () => {
        await result.current.reload();
      });

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.deleteShare('share-1');
      });

      expect(ok).toBe(false);
      expect(result.current.shares).toEqual([grant]);
    });
  });
});
