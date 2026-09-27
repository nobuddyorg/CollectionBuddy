// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react';
import { act, renderHook, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastProvider, useToast } from './components/Toast/ToastProvider';
import { I18nProvider } from './i18n/I18nProvider';
import { useSignOut } from './useSignOut';
import { forgetUserData } from './userData';

const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
const signOut = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ supabase: { auth: { signOut } } }));
vi.mock('./userData', () => ({ forgetUserData: vi.fn() }));

const SIGN_OUT_ERROR =
  "Sign-out didn't fully complete, but you've been signed out on this device. Please try again.";

function setUp() {
  return renderHook(() => ({ signOut: useSignOut(), toast: useToast() }), {
    wrapper: ({ children }: { children: ReactNode }) =>
      createElement(
        I18nProvider,
        null,
        createElement(ToastProvider, null, children),
      ),
  });
}

function expectSessionEnded() {
  expect(forgetUserData).toHaveBeenCalledOnce();
  expect(replace).toHaveBeenCalledExactlyOnceWith('/login');
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.setItem('lang', 'en');
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('useSignOut', () => {
  it('sends pending deletes, revokes the session everywhere, forgets its data and returns to the login page', async () => {
    signOut.mockResolvedValue({ error: null });
    const pendingDelete = vi.fn();
    const { result } = setUp();
    act(() =>
      result.current.toast.success('Entry deleted', {
        onExpire: pendingDelete,
      }),
    );

    await act(() => result.current.signOut());

    expect(pendingDelete).toHaveBeenCalledOnce();
    expect(pendingDelete.mock.invocationCallOrder[0]).toBeLessThan(
      signOut.mock.invocationCallOrder[0],
    );
    expect(signOut).toHaveBeenCalledExactlyOnceWith();
    expect(screen.queryByText(SIGN_OUT_ERROR)).not.toBeInTheDocument();
    expectSessionEnded();
  });

  // auth-js already clears the local session when the revoke fails; a second, local-only call adds nothing.
  it('reports a failed revoke and still ends the session here, without a second sign-out call', async () => {
    const error = new Error('revoke failed');
    signOut.mockResolvedValue({ error });
    const { result } = setUp();

    await act(() => result.current.signOut());

    expect(await screen.findByText(SIGN_OUT_ERROR)).toBeVisible();
    expect(console.error).toHaveBeenCalledWith('sign out failed', error);
    expect(signOut).toHaveBeenCalledOnce();
    expectSessionEnded();
  });

  it('clears the local session when sign-out throws, and still ends the session', async () => {
    const thrown = new Error('lock timed out');
    signOut
      .mockRejectedValueOnce(thrown)
      .mockResolvedValueOnce({ error: null });
    const { result } = setUp();

    await act(() => result.current.signOut());

    expect(await screen.findByText(SIGN_OUT_ERROR)).toBeVisible();
    expect(console.error).toHaveBeenCalledWith(
      'sign out unexpected error',
      thrown,
    );
    expect(signOut).toHaveBeenLastCalledWith({ scope: 'local' });
    expectSessionEnded();
  });

  it('still ends the session when the local clear after a throw fails too', async () => {
    signOut.mockRejectedValue(new Error('offline'));
    const { result } = setUp();

    await act(() => result.current.signOut());

    expect(signOut).toHaveBeenCalledTimes(2);
    expectSessionEnded();
  });
});
