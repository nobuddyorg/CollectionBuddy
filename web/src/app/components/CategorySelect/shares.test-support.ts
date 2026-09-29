import { vi } from 'vitest';

import type { CategoryShareSummary } from '../../data/shares';
import type { UseShares } from './useShares';

export const grant: CategoryShareSummary = {
  id: 'share-1',
  invited_email: 'grantee@example.com',
  expires_at: null,
  owner_user_id: 'owner-1',
  role: 'viewer',
};

export function sharesState(overrides: Partial<UseShares> = {}): UseShares {
  return {
    shares: [],
    isLoading: false,
    isSharing: false,
    isRevoking: false,
    isUpdatingRole: false,
    reload: vi.fn().mockResolvedValue(undefined),
    createShare: vi.fn().mockResolvedValue(true),
    revokeShare: vi.fn().mockResolvedValue(undefined),
    leaveShare: vi.fn().mockResolvedValue(true),
    updateShareRole: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}
