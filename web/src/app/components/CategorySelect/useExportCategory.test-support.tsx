import { vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { exportCategory } from '../../data/exportCategory';

export function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

export const CATEGORY = { id: 'cat-1', name: 'Coins' };

export function exported(overrides: Record<string, unknown> = {}) {
  return {
    blob: new Blob(['zip']),
    filename: 'CollectionBuddy-coins.zip',
    photoCount: 2,
    skippedPhotoCount: 0,
    skippedItemCount: 0,
    ...overrides,
  };
}

export type ExportArgs = Parameters<typeof exportCategory>[0];

/** The argument object the hook handed `exportCategory` on its last call. */
export function lastCall(): ExportArgs {
  return vi.mocked(exportCategory).mock.calls.at(-1)![0];
}

export function installExportMocks() {
  vi.clearAllMocks();
  window.localStorage.setItem('lang', 'en');
  vi.mocked(exportCategory).mockResolvedValue(exported() as never);
}
