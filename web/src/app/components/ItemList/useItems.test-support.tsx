import type { ReactNode } from 'react';
import type { Mock } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { takePrefetchedFirstPage } from './firstPagePrefetch';

export function wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

export function page(items: { id: string }[] = [], count = items.length) {
  return {
    data: items.map((entry) => ({
      id: entry.id,
      title: entry.id,
      description: null,
      place: null,
      place_lat: null,
      place_lng: null,
      tags: [],
    })),
    error: null,
    count,
  };
}

// The listing mock is the importing test file's own `vi.hoisted` one, which its `vi.mock` routes through.
export function resetItemsTestState(listItemsMock: Mock) {
  window.localStorage.setItem('lang', 'en');
  listItemsMock.mockReset();
  void takePrefetchedFirstPage('');
}
