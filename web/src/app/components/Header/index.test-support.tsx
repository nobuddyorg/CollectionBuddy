import { render } from '@testing-library/react';
import { vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import Header from './index';
import type { HeaderProps } from './types';

export function renderHeader(overrides: Partial<HeaderProps> = {}) {
  return render(
    <I18nProvider>
      <Header
        user={{ email: 'collector@example.com' }}
        onSignOut={vi.fn()}
        onDeleteAccount={vi.fn()}
        onOpenHelp={vi.fn()}
        {...overrides}
      />
    </I18nProvider>,
  );
}
