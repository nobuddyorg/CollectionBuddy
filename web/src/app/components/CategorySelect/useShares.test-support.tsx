import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';

import { listSharesForCategory } from '../../data/shares';
import type { CategoryShareSummary } from '../../data/shares';
import { ToastWrapper } from '../providers.test-support';
import { useShares } from './useShares';

export { ToastWrapper as wrapper } from '../providers.test-support';
export { grant } from './shares.test-support';

export function listSharesReturns(grants: CategoryShareSummary[]) {
  vi.mocked(listSharesForCategory).mockResolvedValue({
    data: grants,
    error: null,
  } as never);
}

export async function renderLoadedShares() {
  const hook = renderHook(() => useShares('cat-1'), { wrapper: ToastWrapper });
  await act(async () => {
    await hook.result.current.reload();
  });
  return hook;
}
