// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createShare as createShareRow,
  listSharesForCategory,
} from '../../data/shares';
import { useShares } from './useShares';
import { grant, listSharesReturns, wrapper } from './useShares.test-support';

vi.mock('../../data/shares', () => ({
  createShare: vi.fn(),
  deleteShare: vi.fn(),
  listSharesForCategory: vi.fn(),
  updateShareRole: vi.fn(),
}));

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
      listSharesReturns([grant]);
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
      listSharesReturns([grant]);
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
      expect(createShareRow).toHaveBeenCalledWith({
        categoryId: 'cat-1',
        invitedEmail: 'grantee@example.com',
        expiresAt: null,
      });
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

    it('says the share limit is reached when the database refuses it for its quota', async () => {
      vi.mocked(createShareRow).mockResolvedValue({
        data: null,
        error: { code: 'PT507', message: 'share quota of 1000 reached' },
      } as never);
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const { result } = renderHook(() => useShares('cat-1'), { wrapper });

      let ok: boolean | undefined;
      await act(async () => {
        ok = await result.current.createShare('guest@example.com', null);
      });

      expect(ok).toBe(false);
      expect(result.current.shares).toEqual([]);
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'You have reached the limit of 1,000 shares. Remove one to invite someone else.',
      );
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
});
