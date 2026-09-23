// @vitest-environment jsdom
import { act, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import {
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

describe('useShares updateShareRole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
  });

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
    expect(consoleError).toHaveBeenCalledWith('update share role', updateError);
    consoleError.mockRestore();
  });
});
