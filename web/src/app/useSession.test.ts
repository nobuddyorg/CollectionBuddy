// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { supabase } from './supabase';
import { useSession } from './useSession';
import type { Session, User } from '@supabase/supabase-js';

// #340: useSession decides whether a visitor is signed in, and the comment
// at its own top (getSession over getUser, for first-paint speed) trades
// revalidation for local trust -- which makes onAuthStateChange's null path
// the *only* thing that catches a stale session. None of it had a test.

type GetSessionResult = Awaited<ReturnType<typeof supabase.auth.getSession>>;
type AuthChangeHandler = Parameters<typeof supabase.auth.onAuthStateChange>[0];

function userWith(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'collector@example.com',
    user_metadata: { name: 'Ada' },
    ...overrides,
  } as User;
}

function sessionWith(user: User): Session {
  return { user } as Session;
}

// The real onAuthStateChange returns a subscription object; captured here so
// a test can fire the callback itself, the way a sign-out or a token expiry
// would.
function mockAuthStateChange() {
  const unsubscribe = vi.fn();
  let handler: AuthChangeHandler | null = null;
  vi.spyOn(supabase.auth, 'onAuthStateChange').mockImplementation((cb) => {
    handler = cb;
    return {
      data: { subscription: { unsubscribe } },
    } as unknown as ReturnType<typeof supabase.auth.onAuthStateChange>;
  });
  return {
    unsubscribe,
    fire: (
      event: Parameters<AuthChangeHandler>[0],
      session: Session | null,
    ) => {
      void act(() => handler?.(event, session));
    },
  };
}

describe('useSession', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('populates the user once getSession resolves one', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: sessionWith(userWith()) },
      error: null,
    } satisfies GetSessionResult);
    mockAuthStateChange();

    const { result } = renderHook(() => useSession());
    expect(result.current.loading).toBe(true);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual({
      id: 'user-1',
      email: 'collector@example.com',
      name: 'Ada',
    });
  });

  it('leaves the user null when getSession resolves no session', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: null },
      error: null,
    } satisfies GetSessionResult);
    mockAuthStateChange();

    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toBeNull();
  });

  it('falls back name and email to null rather than to undefined', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: {
        session: sessionWith({
          id: 'user-2',
          email: undefined,
          user_metadata: {},
        } as User),
      },
      error: null,
    } satisfies GetSessionResult);
    mockAuthStateChange();

    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user).toEqual({
      id: 'user-2',
      email: null,
      name: null,
    });
  });

  // A non-string user_metadata.name (absent, or some other provider's shape)
  // must not be trusted as-is -- sessionUserFrom narrows it explicitly
  // rather than casting whatever Google's response happened to contain.
  it('discards a non-string name rather than passing it through', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: {
        session: sessionWith({
          id: 'user-3',
          email: 'x@example.com',
          user_metadata: { name: 42 },
        } as unknown as User),
      },
      error: null,
    } satisfies GetSessionResult);
    mockAuthStateChange();

    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.user?.name).toBeNull();
  });

  // The one path the getSession-over-getUser tradeoff leaves to catch a
  // stale session: sign-out and token expiry both surface as
  // onAuthStateChange firing with session: null.
  it('clears the user when onAuthStateChange later fires with no session', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: sessionWith(userWith()) },
      error: null,
    } satisfies GetSessionResult);
    const { fire } = mockAuthStateChange();

    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.user).not.toBeNull());

    fire('SIGNED_OUT', null);
    expect(result.current.user).toBeNull();
  });

  it('adopts the new user when onAuthStateChange fires with a different session', async () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: sessionWith(userWith()) },
      error: null,
    } satisfies GetSessionResult);
    const { fire } = mockAuthStateChange();

    const { result } = renderHook(() => useSession());
    await waitFor(() => expect(result.current.user).not.toBeNull());

    fire(
      'TOKEN_REFRESHED',
      sessionWith(userWith({ id: 'user-4', email: 'new@example.com' })),
    );
    expect(result.current.user?.id).toBe('user-4');
  });

  // Unmounting before getSession resolves must not update state React can no
  // longer own -- the `active` guard is what stands between this and a
  // "state update on an unmounted component" warning.
  it('does not update state from a getSession that resolves after unmount', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    let resolveSession!: (value: GetSessionResult) => void;
    vi.spyOn(supabase.auth, 'getSession').mockReturnValue(
      new Promise((resolve) => {
        resolveSession = resolve;
      }),
    );
    mockAuthStateChange();

    const { unmount } = renderHook(() => useSession());
    unmount();

    await act(async () => {
      resolveSession({
        data: { session: sessionWith(userWith()) },
        error: null,
      });
      await Promise.resolve();
    });

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('unsubscribes from auth state changes on unmount', () => {
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: null },
      error: null,
    } satisfies GetSessionResult);
    const { unsubscribe } = mockAuthStateChange();

    const { unmount } = renderHook(() => useSession());
    unmount();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
