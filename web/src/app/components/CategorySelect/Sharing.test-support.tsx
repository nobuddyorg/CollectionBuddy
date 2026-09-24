import { render } from '@testing-library/react';
import { vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { SharingSection } from './Sharing';
import type { UseShares } from './useShares';

export function sharesState(overrides: Partial<UseShares> = {}): UseShares {
  return {
    shares: [],
    isLoading: false,
    isSharing: false,
    isRevoking: false,
    isUpdatingRole: false,
    reload: vi.fn().mockResolvedValue([]),
    createShare: vi.fn().mockResolvedValue(true),
    deleteShare: vi.fn().mockResolvedValue(true),
    updateShareRole: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

export function renderSection(shares: UseShares) {
  render(
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <SharingSection shares={shares} />
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}
