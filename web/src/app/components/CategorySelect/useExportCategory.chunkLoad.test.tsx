// @vitest-environment jsdom
import { act, renderHook, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { useExportCategory } from './useExportCategory';

// The export code loads on the click; a tab left open across a deploy can find its chunk gone.
vi.mock('../../data/exportCategory', () => {
  throw new Error('chunk load failed');
});

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

it('reports export code that fails to load as a failed export, and stops exporting', async () => {
  window.localStorage.setItem('lang', 'en');
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { result } = renderHook(() => useExportCategory(), { wrapper });

  await act(async () => {
    await result.current.runExport({ id: 'cat-1', name: 'Coins' });
  });

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not export this collection. Please try again.',
  );
  expect(result.current.isExporting).toBe(false);
  consoleError.mockRestore();
});
