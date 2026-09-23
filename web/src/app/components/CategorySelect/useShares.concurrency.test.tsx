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
