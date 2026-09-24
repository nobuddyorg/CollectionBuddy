import { act, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { listSharesForCategory } from '../../data/shares';
import { useShares } from './useShares';

export function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

export const grant = {
  id: 'share-1',
  invited_email: 'grantee@example.com',
  expires_at: null,
  owner_user_id: 'owner-1',
  role: 'viewer' as const,
};

export function listSharesReturns(grants: (typeof grant)[]) {
  vi.mocked(listSharesForCategory).mockResolvedValue({
    data: grants,
    error: null,
  } as never);
}

export async function renderLoadedShares() {
  const hook = renderHook(() => useShares('cat-1'), { wrapper });
  await act(async () => {
    await hook.result.current.reload();
  });
  return hook;
}

// The row disappears at once; the deferred deleteShareRow is committed by closing the toast.
export async function commitDeferredDelete() {
  await screen.findByRole('status');
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
}
