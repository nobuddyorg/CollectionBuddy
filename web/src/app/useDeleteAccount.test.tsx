// @vitest-environment jsdom
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfirmProvider } from './components/Confirm/ConfirmProvider';
import { ToastProvider, useToast } from './components/Toast/ToastProvider';
import { deleteOwnAccount } from './data/account';
import { I18nProvider } from './i18n/I18nProvider';
import { useDeleteAccount } from './useDeleteAccount';
import { forgetUserData } from './userData';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
vi.mock('./data/account', () => ({ deleteOwnAccount: vi.fn() }));
vi.mock('./userData', () => ({ forgetUserData: vi.fn() }));

function setUp() {
  // The confirm dialog and the toasts render through their providers, so the hook needs a real tree around it.
  return renderHook(
    ({ userId }: { userId: string }) => ({
      account: useDeleteAccount(userId),
      toast: useToast(),
    }),
    {
      initialProps: { userId: 'uid-1' },
      wrapper: ({ children }) => (
        <I18nProvider>
          <ToastProvider>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ToastProvider>
        </I18nProvider>
      ),
    },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.setItem('lang', 'en');
});

describe('useDeleteAccount', () => {
  it('asks first, and deletes nothing when the warning is cancelled', async () => {
    const { result } = setUp();

    void result.current.account.deleteAccount();
    expect(
      await screen.findByText(/Delete your account\? All your collections/),
    ).toBeVisible();
    await userEvent.click(screen.getByTestId('confirm-cancel'));

    expect(deleteOwnAccount).not.toHaveBeenCalled();
    expect(result.current.account.deleting).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });

  it('sends pending deletes first, deletes the account, forgets its browser data and returns to the login page', async () => {
    let finish: (value: { error: null }) => void = () => {};
    vi.mocked(deleteOwnAccount).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const pendingDelete = vi.fn();
    const { result } = setUp();
    act(() =>
      result.current.toast.success('Entry deleted', {
        onExpire: pendingDelete,
      }),
    );

    void result.current.account.deleteAccount();
    await userEvent.click(await screen.findByTestId('confirm-accept'));

    await waitFor(() => expect(deleteOwnAccount).toHaveBeenCalledWith('uid-1'));
    expect(result.current.account.deleting).toBe(true);
    expect(pendingDelete).toHaveBeenCalledOnce();
    expect(pendingDelete.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(deleteOwnAccount).mock.invocationCallOrder[0],
    );
    expect(replace).not.toHaveBeenCalled();

    await act(async () => finish({ error: null }));

    expect(forgetUserData).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledWith('/login');
    // The toast, and the live region that reads it out.
    expect(
      await screen.findAllByText('Your account has been deleted.'),
    ).toHaveLength(2);
  });

  it('deletes the account signed in now, not the one it first rendered for', async () => {
    vi.mocked(deleteOwnAccount).mockResolvedValue({ error: null });
    const { result, rerender } = setUp();
    rerender({ userId: 'uid-2' });

    void result.current.account.deleteAccount();
    await userEvent.click(await screen.findByTestId('confirm-accept'));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(deleteOwnAccount).toHaveBeenCalledWith('uid-2');
  });

  it('reports a refused delete and stays signed in on the page', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const refused = { code: 'PT409' };
    vi.mocked(deleteOwnAccount).mockResolvedValue({ error: refused });
    const { result } = setUp();

    void result.current.account.deleteAccount();
    await userEvent.click(await screen.findByTestId('confirm-accept'));

    expect(
      await screen.findByText(/Your account could not be deleted/),
    ).toBeVisible();
    expect(consoleError).toHaveBeenCalledWith('delete account', refused);
    expect(result.current.account.deleting).toBe(false);
    expect(forgetUserData).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it('reports a delete that throws the same way', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(deleteOwnAccount).mockRejectedValue(new Error('offline'));
    const { result } = setUp();

    void result.current.account.deleteAccount();
    await userEvent.click(await screen.findByTestId('confirm-accept'));

    expect(
      await screen.findByText(/Your account could not be deleted/),
    ).toBeVisible();
    expect(result.current.account.deleting).toBe(false);
    expect(replace).not.toHaveBeenCalled();
  });
});
