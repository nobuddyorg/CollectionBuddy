// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import {
  deleteShare as deleteShareRow,
  listSharesForCategory,
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

describe('useShares deleteShare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
  });

  // The row disappears at once; the deferred deleteShareRow is committed by closing the toast.
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

    await waitFor(() => expect(deleteShareRow).toHaveBeenCalledWith('share-2'));
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

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(result.current.shares).toEqual([grant, { ...grant, id: 'share-2' }]);
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

  // Only a grant that is not first tells a real index lookup from one that always lands on 0.
  it('puts a grant that was not the first one back exactly where it was', async () => {
    const second = { ...grant, id: 'share-2', invited_email: 'b@x.test' };
    const third = { ...grant, id: 'share-3', invited_email: 'c@x.test' };
    vi.mocked(listSharesForCategory).mockResolvedValue({
      data: [grant, second, third],
      error: null,
    } as never);
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
    expect(result.current.shares).toEqual([grant, third]);

    await userEvent.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(result.current.shares).toEqual([grant, second, third]);
    expect(deleteShareRow).not.toHaveBeenCalled();
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
    // No undo toast either: promising a revoke that never happened is worse than the missing row.
    expect(screen.queryByRole('status')).toBeNull();
  });
});
