import { vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { importCategory } from '../../data/importCategory';
import { readZipEntries } from '../../data/zip';

const MANIFEST = {
  format: 'collectionbuddy-category-export',
  version: 1,
  category: { id: 'orig', name: 'Coins' },
  exportedAt: '2026-08-06T00:00:00.000Z',
  items: [],
};

function archiveHolding(manifest: unknown) {
  return new Map([
    [
      'CollectionBuddy-coins/collection.json',
      new TextEncoder().encode(JSON.stringify(manifest)),
    ],
  ]);
}

export function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ToastProvider>{children}</ToastProvider>
    </I18nProvider>
  );
}

export function imported(overrides: Record<string, unknown> = {}) {
  return {
    category: { id: 'cat-9', name: 'Coins (2)', user_id: 'owner-1' },
    itemCount: 1,
    photoCount: 1,
    skippedPhotoCount: 0,
    ...overrides,
  };
}

export const FILE = new File(['zip'], 'coins.zip');

// A well-formed archive of one category that imports as one item with one photograph.
export function installImportMocks() {
  vi.clearAllMocks();
  window.localStorage.setItem('lang', 'en');
  vi.mocked(readZipEntries).mockResolvedValue(archiveHolding(MANIFEST));
  vi.mocked(importCategory).mockResolvedValue(imported());
}
