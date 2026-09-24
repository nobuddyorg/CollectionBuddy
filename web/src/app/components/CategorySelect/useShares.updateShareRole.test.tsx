// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { updateShareRole as updateShareRoleRow } from '../../data/shares';
import {
  grant,
  listSharesReturns,
  renderLoadedShares,
} from './useShares.test-support';

vi.mock('../../data/shares', () => ({
  createShare: vi.fn(),
  deleteShare: vi.fn(),
  listSharesForCategory: vi.fn(),
  updateShareRole: vi.fn(),
}));

describe('useShares updateShareRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
  });

  it("replaces the grant with the server's row on success", async () => {
    listSharesReturns([grant]);
    const updated = { ...grant, role: 'editor' as const };
    vi.mocked(updateShareRoleRow).mockResolvedValue({
      data: updated,
      error: null,
    } as never);
    const { result } = await renderLoadedShares();

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.updateShareRole('share-1', 'editor');
    });

    expect(ok).toBe(true);
    expect(updateShareRoleRow).toHaveBeenCalledWith('share-1', 'editor');
    expect(result.current.shares).toEqual([updated]);
  });

  it('succeeds without changing the list when the server returns no row', async () => {
    listSharesReturns([grant]);
    vi.mocked(updateShareRoleRow).mockResolvedValue({
      data: null,
      error: null,
    } as never);
    const { result } = await renderLoadedShares();

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
    listSharesReturns([grant, other]);
    const updated = { ...grant, role: 'editor' as const };
    vi.mocked(updateShareRoleRow).mockResolvedValue({
      data: updated,
      error: null,
    } as never);
    const { result } = await renderLoadedShares();

    await act(async () => {
      await result.current.updateShareRole('share-1', 'editor');
    });

    expect(result.current.shares).toEqual([updated, other]);
  });

  it('leaves the list untouched when the update fails', async () => {
    listSharesReturns([grant]);
    const updateError = new Error('boom');
    vi.mocked(updateShareRoleRow).mockResolvedValue({
      data: null,
      error: updateError,
    } as never);
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const { result } = await renderLoadedShares();

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
    expect(consoleError).toHaveBeenCalledWith('update share role', updateError);
    consoleError.mockRestore();
  });
});
