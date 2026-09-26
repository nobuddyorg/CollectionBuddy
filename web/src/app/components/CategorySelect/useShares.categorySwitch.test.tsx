// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createShare as createShareRow,
  deleteShare as deleteShareRow,
  listSharesForCategory,
  updateShareRole as updateShareRoleRow,
} from '../../data/shares';
import type { CategoryShareSummary } from '../../data/shares';
import { useShares } from './useShares';
import { grant, wrapper } from './useShares.test-support';

vi.mock('../../data/shares', () => ({
  createShare: vi.fn(),
  deleteShare: vi.fn(),
  listSharesForCategory: vi.fn(),
  updateShareRole: vi.fn(),
}));

const coinsGrant: CategoryShareSummary = { ...grant, id: 'share-coins' };
const stampsGrant: CategoryShareSummary = {
  ...grant,
  id: 'share-stamps',
  invited_email: 'stamps@example.com',
};

type Response = { data: CategoryShareSummary[] | null; error: Error | null };

/** One list request per call, each settled by the test in whatever order the race needs. */
function deferListRequests() {
  const pending: ((response: Response) => void)[] = [];
  vi.mocked(listSharesForCategory).mockImplementation(
    () =>
      new Promise((resolve) => {
        pending.push(resolve);
      }) as never,
  );
  return (request: number, response: Response) =>
    act(async () => {
      pending[request](response);
    });
}

function renderSharesFor(categoryId: string) {
  return renderHook<ReturnType<typeof useShares>, { categoryId: string }>(
    (props) => useShares(props.categoryId),
    { wrapper, initialProps: { categoryId } },
  );
}

async function renderCoinsThenSwitchToStamps() {
  vi.mocked(listSharesForCategory).mockResolvedValueOnce({
    data: [coinsGrant],
    error: null,
  } as never);
  const hook = renderSharesFor('coins');
  await act(async () => {
    await hook.result.current.reload();
  });
  expect(hook.result.current.shares).toEqual([coinsGrant]);
  hook.rerender({ categoryId: 'stamps' });
  return hook;
}

// Each row acts by its share id, so a row left over from the previous category acts on that category.
describe('useShares across a category switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
  });

  it("drops the previous category's grants the moment the category changes", async () => {
    const { result } = await renderCoinsThenSwitchToStamps();

    expect(result.current.shares).toEqual([]);
  });

  it('shows no grants at all when the new category fails to load', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = await renderCoinsThenSwitchToStamps();
    vi.mocked(listSharesForCategory).mockResolvedValueOnce({
      data: null,
      error: new Error('offline'),
    } as never);

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.shares).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load sharing. Please try again.',
    );
    consoleError.mockRestore();
  });

  it('still lists an invitation made after the new category failed to load', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = await renderCoinsThenSwitchToStamps();
    vi.mocked(listSharesForCategory).mockResolvedValueOnce({
      data: null,
      error: new Error('offline'),
    } as never);
    vi.mocked(createShareRow).mockResolvedValue({
      data: stampsGrant,
      error: null,
    } as never);
    await act(async () => {
      await result.current.reload();
    });

    await act(async () => {
      await result.current.createShare('stamps@example.com', null);
    });

    expect(result.current.shares).toEqual([stampsGrant]);
    consoleError.mockRestore();
  });

  it('clears what a category had when reloading that same category fails', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.mocked(listSharesForCategory)
      .mockResolvedValueOnce({ data: [coinsGrant], error: null } as never)
      .mockResolvedValueOnce({ data: null, error: new Error('x') } as never);
    const { result } = renderSharesFor('coins');
    await act(async () => {
      await result.current.reload();
    });

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.shares).toEqual([]);
    consoleError.mockRestore();
  });

  it('never lets a late answer for the previous category fill the new one', async () => {
    const settle = deferListRequests();
    const { result, rerender } = renderSharesFor('coins');
    act(() => {
      void result.current.reload();
    });

    rerender({ categoryId: 'stamps' });
    await settle(0, { data: [coinsGrant], error: null });

    expect(result.current.shares).toEqual([]);
  });

  it("keeps the new category's grants when the previous one answers last", async () => {
    const settle = deferListRequests();
    const { result, rerender } = renderSharesFor('coins');
    act(() => {
      void result.current.reload();
    });
    rerender({ categoryId: 'stamps' });
    act(() => {
      void result.current.reload();
    });

    await settle(1, { data: [stampsGrant], error: null });
    expect(result.current.isLoading).toBe(false);
    await settle(0, { data: [coinsGrant], error: null });

    expect(result.current.shares).toEqual([stampsGrant]);
    expect(result.current.isLoading).toBe(false);
  });

  // Coins -> Stamps -> Coins: the first Coins answer is older than the second, and must not replace it.
  it('keeps the newest answer when switching back and forth', async () => {
    const settle = deferListRequests();
    const renamed = { ...coinsGrant, invited_email: 'newer@example.com' };
    const { result, rerender } = renderSharesFor('coins');
    act(() => {
      void result.current.reload();
    });
    rerender({ categoryId: 'stamps' });
    act(() => {
      void result.current.reload();
    });
    rerender({ categoryId: 'coins' });
    act(() => {
      void result.current.reload();
    });

    await settle(2, { data: [renamed], error: null });
    await settle(1, { data: [stampsGrant], error: null });
    await settle(0, { data: [coinsGrant], error: null });

    expect(result.current.shares).toEqual([renamed]);
  });

  it('stays loading until the newest request settles, not the one it superseded', async () => {
    const settle = deferListRequests();
    const { result, rerender } = renderSharesFor('coins');
    act(() => {
      void result.current.reload();
    });
    rerender({ categoryId: 'stamps' });
    act(() => {
      void result.current.reload();
    });

    await settle(0, { data: [coinsGrant], error: null });
    expect(result.current.isLoading).toBe(true);
    await settle(1, { data: [], error: null });

    expect(result.current.isLoading).toBe(false);
  });

  it('logs a superseded failure without telling the user about a category they left', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const settle = deferListRequests();
    const failure = new Error('offline');
    const { result, rerender } = renderSharesFor('coins');
    act(() => {
      void result.current.reload();
    });
    rerender({ categoryId: 'stamps' });
    act(() => {
      void result.current.reload();
    });
    await settle(1, { data: [stampsGrant], error: null });

    await settle(0, { data: null, error: failure });

    expect(result.current.shares).toEqual([stampsGrant]);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(consoleError).toHaveBeenCalledWith('reload shares', failure);
    consoleError.mockRestore();
  });

  it('refuses to revoke a grant of the category switched away from', async () => {
    const { result } = await renderCoinsThenSwitchToStamps();

    await act(async () => {
      await result.current.revokeShare('share-coins');
    });

    expect(deleteShareRow).not.toHaveBeenCalled();
  });

  it('refuses to change the role of a grant of the category switched away from', async () => {
    const { result } = await renderCoinsThenSwitchToStamps();

    let changed: boolean | undefined;
    await act(async () => {
      changed = await result.current.updateShareRole('share-coins', 'editor');
    });

    expect(changed).toBe(false);
    expect(updateShareRoleRow).not.toHaveBeenCalled();
  });

  it('refuses to leave a grant of the category switched away from', async () => {
    const { result } = await renderCoinsThenSwitchToStamps();

    let left: boolean | undefined;
    await act(async () => {
      left = await result.current.leaveShare('share-coins');
    });

    expect(left).toBe(false);
    expect(deleteShareRow).not.toHaveBeenCalled();
  });

  it('keeps an invitation that lands after a switch out of the new category', async () => {
    let release: (() => void) | undefined;
    vi.mocked(createShareRow).mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ data: coinsGrant, error: null });
      }) as never,
    );
    vi.mocked(listSharesForCategory).mockResolvedValue({
      data: [stampsGrant],
      error: null,
    } as never);
    const { result, rerender } = renderSharesFor('coins');
    act(() => {
      void result.current.createShare('grantee@example.com', null);
    });
    rerender({ categoryId: 'stamps' });
    await act(async () => {
      await result.current.reload();
    });

    await act(async () => {
      release?.();
    });

    expect(result.current.shares).toEqual([stampsGrant]);
  });

  it('undo after a switch reissues the grant without showing it in the new category', async () => {
    vi.mocked(deleteShareRow).mockResolvedValue({ error: null } as never);
    vi.mocked(createShareRow).mockResolvedValue({
      data: coinsGrant,
      error: null,
    } as never);
    vi.mocked(listSharesForCategory).mockResolvedValue({
      data: [coinsGrant],
      error: null,
    } as never);
    const { result, rerender } = renderSharesFor('coins');
    await act(async () => {
      await result.current.reload();
    });
    await act(async () => {
      await result.current.revokeShare('share-coins');
    });
    vi.mocked(listSharesForCategory).mockResolvedValue({
      data: [stampsGrant],
      error: null,
    } as never);
    rerender({ categoryId: 'stamps' });
    await act(async () => {
      await result.current.reload();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() =>
      expect(createShareRow).toHaveBeenCalledWith({
        categoryId: 'coins',
        invitedEmail: coinsGrant.invited_email,
        expiresAt: null,
        role: 'viewer',
      }),
    );
    expect(result.current.shares).toEqual([stampsGrant]);
  });
});
