import type { ReactNode } from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { I18nProvider } from '../i18n/I18nProvider';
import { ConfirmProvider } from './Confirm/ConfirmProvider';
import { ToastProvider } from './Toast/ToastProvider';

export function ToastWrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

export function ToastConfirmWrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

// Closing the toast commits its deferred delete the same way expiry would.
export async function commitDeferredDelete() {
  await screen.findByTestId('toast');
  await userEvent.click(screen.getByRole('button', { name: 'Close' }));
}

export async function acceptConfirmation() {
  await userEvent.click(await screen.findByTestId('confirm-accept'));
}
