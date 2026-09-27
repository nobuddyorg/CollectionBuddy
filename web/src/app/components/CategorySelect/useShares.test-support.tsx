import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { listSharesForCategory } from '../../data/shares';
import type { CategoryShareSummary } from '../../data/shares';
import { useShares } from './useShares';

export function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

export const grant: CategoryShareSummary = {
  id: 'share-1',
  invited_email: 'grantee@example.com',
  expires_at: null,
  owner_user_id: 'owner-1',
  role: 'viewer',
};

export function listSharesReturns(grants: CategoryShareSummary[]) {
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
