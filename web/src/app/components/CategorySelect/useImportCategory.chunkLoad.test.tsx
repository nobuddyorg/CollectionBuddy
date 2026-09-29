// @vitest-environment jsdom
import { act, renderHook, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { ToastWrapper } from '../providers.test-support';
import { useImportCategory } from './useImportCategory';

// The import code loads on the click; a tab left open across a deploy can find its chunk gone.
vi.mock('../../data/importCategory', () => {
  throw new Error('chunk load failed');
});

it('reports import code that fails to load as a failed import, and stops importing', async () => {
  window.localStorage.setItem('lang', 'en');
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { result } = renderHook(() => useImportCategory([]), {
    wrapper: ToastWrapper,
  });

  await act(async () => {
    await result.current.runImport(new File(['zip'], 'coins.zip'));
  });

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Could not import this archive. Please try again.',
  );
  expect(result.current.isImporting).toBe(false);
  consoleError.mockRestore();
});
