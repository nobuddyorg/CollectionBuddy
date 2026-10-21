import { render } from '@testing-library/react';
import { vi } from 'vitest';

import { ToastWrapper } from '../providers.test-support';
import Header from './index';
import type { HeaderProps } from './types';

export function renderHeader(overrides: Partial<HeaderProps> = {}) {
  return render(
    <ToastWrapper>
      <Header
        user={{ email: 'collector@example.com' }}
        onSignOut={vi.fn()}
        onDeleteAccount={vi.fn()}
        onOpenHelp={vi.fn()}
        {...overrides}
      />
    </ToastWrapper>,
  );
}
