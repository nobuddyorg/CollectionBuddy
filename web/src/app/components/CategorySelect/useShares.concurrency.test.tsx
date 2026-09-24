// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createShare as createShareRow,
  deleteShare as deleteShareRow,
  updateShareRole as updateShareRoleRow,
} from '../../data/shares';
import { useShares } from './useShares';
import {
  commitDeferredDelete,
  grant,
  listSharesReturns,
  renderLoadedShares,
  wrapper,
} from './useShares.test-support';

vi.mock('../../data/shares', () => ({
  createShare: vi.fn(),
  deleteShare: vi.fn(),
  listSharesForCategory: vi.fn(),
  updateShareRole: vi.fn(),
}));

// The second click of a double-click must not issue a second grant, role write or delete.
describe('useShares one request at a time', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
  });

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
    listSharesReturns([grant, { ...grant, id: 'share-2' }]);
    let release: (() => void) | undefined;
    vi.mocked(deleteShareRow).mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ error: null });
      }) as never,
    );
    const { result } = await renderLoadedShares();

    act(() => {
      result.current.deleteShare('share-1', {
        successMessage: 'Removed.',
        errorMessage: 'Could not remove.',
      });
    });
    await commitDeferredDelete();
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
