// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createShare as createShareRow,
  deleteShare as deleteShareRow,
} from '../../data/shares';
import { useShares } from './useShares';
import {
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

const second = { ...grant, id: 'share-2', invited_email: 'b@x.test' };
const third = { ...grant, id: 'share-3', invited_email: 'c@x.test' };

function deleteShareRowReturns(error: Error | null) {
  vi.mocked(deleteShareRow).mockResolvedValue({ error } as never);
}

describe('useShares revokeShare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
  });

  // No toast to wait out: a grant the owner was told is gone must already be gone.
  it('deletes the grant at once and drops exactly that row', async () => {
    listSharesReturns([grant, second]);
    deleteShareRowReturns(null);
    const { result } = await renderLoadedShares();

    await act(async () => {
      await result.current.revokeShare('share-2');
    });

    expect(deleteShareRow).toHaveBeenCalledWith('share-2');
    expect(result.current.shares).toEqual([grant]);
    expect(screen.getByRole('status')).toHaveTextContent('Sharing revoked.');
    expect(result.current.isRevoking).toBe(false);
  });

  // Not optimistic: a row that vanished before the delete landed could be closed on while still live.
  it('keeps the row, and stays busy, until the delete has landed', async () => {
    listSharesReturns([grant]);
    let release: (() => void) | undefined;
    vi.mocked(deleteShareRow).mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ error: null });
      }) as never,
    );
    const { result } = await renderLoadedShares();

    act(() => {
      void result.current.revokeShare('share-1');
    });

    await waitFor(() => expect(result.current.isRevoking).toBe(true));
    expect(result.current.shares).toEqual([grant]);
    expect(screen.queryByRole('status')).toBeNull();
    await act(async () => {
      release?.();
    });
    expect(result.current.shares).toEqual([]);
    expect(result.current.isRevoking).toBe(false);
  });

  // Only a grant that is not first tells a real index lookup from one that always lands on 0.
  it('undo issues the same grant again and puts it back where it was', async () => {
    const editorUntil = {
      ...second,
      role: 'editor' as const,
      expires_at: '2099-12-31T00:00:00Z',
    };
    listSharesReturns([grant, editorUntil, third]);
    deleteShareRowReturns(null);
    const reissued = { ...editorUntil, id: 'share-2b' };
    vi.mocked(createShareRow).mockResolvedValue({
      data: reissued,
      error: null,
    } as never);
    const { result } = await renderLoadedShares();

    await act(async () => {
      await result.current.revokeShare('share-2');
    });
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(createShareRow).toHaveBeenCalledWith({
      categoryId: 'cat-1',
      invitedEmail: 'b@x.test',
      expiresAt: '2099-12-31T00:00:00Z',
      role: 'editor',
    });
    await waitFor(() =>
      expect(result.current.shares).toEqual([grant, reissued, third]),
    );
  });

  it('says so, and leaves the row out, when undo cannot issue the grant again', async () => {
    listSharesReturns([grant]);
    deleteShareRowReturns(null);
    const createError = new Error('expired');
    vi.mocked(createShareRow).mockResolvedValue({
      data: null,
      error: createError,
    } as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = await renderLoadedShares();

    await act(async () => {
      await result.current.revokeShare('share-1');
    });
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(
      await screen.findByText(
        'Could not restore this share. Please share it again.',
      ),
    ).toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith('reinstate share', createError);
    expect(result.current.shares).toEqual([]);
    consoleError.mockRestore();
  });

  it('keeps the grant and offers no undo when the delete fails', async () => {
    listSharesReturns([grant, second]);
    const deleteError = new Error('boom');
    deleteShareRowReturns(deleteError);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = await renderLoadedShares();

    await act(async () => {
      await result.current.revokeShare('share-1');
    });

    expect(result.current.shares).toEqual([grant, second]);
    expect(consoleError).toHaveBeenCalledWith('delete share', deleteError);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not revoke this share. Please try again.',
    );
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    expect(result.current.isRevoking).toBe(false);
    consoleError.mockRestore();
  });

  it('does nothing for a grant that is not in the list', async () => {
    listSharesReturns([grant]);
    const { result } = await renderLoadedShares();

    await act(async () => {
      await result.current.revokeShare('share-nope');
    });

    expect(deleteShareRow).not.toHaveBeenCalled();
    expect(result.current.shares).toEqual([grant]);
    // No undo toast either: promising a revoke that never happened is worse than the missing row.
    expect(screen.queryByRole('status')).toBeNull();
  });

  // Undo would have no category to issue the grant in again.
  it('does nothing once the category is no longer selected', async () => {
    listSharesReturns([grant]);
    const initialProps: { categoryId: string | null } = { categoryId: 'cat-1' };
    const { result, rerender } = renderHook(
      ({ categoryId }) => useShares(categoryId),
      { wrapper, initialProps },
    );
    await act(async () => {
      await result.current.reload();
    });
    rerender({ categoryId: null });

    await act(async () => {
      await result.current.revokeShare('share-1');
    });

    expect(deleteShareRow).not.toHaveBeenCalled();
  });
});

describe('useShares leaveShare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
  });

  // A grantee may not issue a grant, so there is nothing an undo could do.
  it('deletes the grant at once and confirms it without an undo', async () => {
    listSharesReturns([grant]);
    deleteShareRowReturns(null);
    const { result } = await renderLoadedShares();

    let left: boolean | undefined;
    await act(async () => {
      left = await result.current.leaveShare('share-1');
    });

    expect(left).toBe(true);
    expect(deleteShareRow).toHaveBeenCalledWith('share-1');
    expect(result.current.shares).toEqual([]);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Left shared collection.',
    );
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('reports failure and keeps the grant when the delete fails', async () => {
    listSharesReturns([grant]);
    deleteShareRowReturns(new Error('boom'));
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = await renderLoadedShares();

    let left: boolean | undefined;
    await act(async () => {
      left = await result.current.leaveShare('share-1');
    });

    expect(left).toBe(false);
    expect(result.current.shares).toEqual([grant]);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not leave this collection. Please try again.',
    );
    expect(screen.queryByRole('status')).toBeNull();
    consoleError.mockRestore();
  });

  it('reports nothing left for a grant that is not in the list', async () => {
    const { result } = renderHook(() => useShares('cat-1'), { wrapper });

    let left: boolean | undefined;
    await act(async () => {
      left = await result.current.leaveShare('share-nope');
    });

    expect(left).toBe(false);
    expect(deleteShareRow).not.toHaveBeenCalled();
  });
});
