// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UseCategories } from './useCategories';
import { openPanel, renderSelect } from './index.test-support';

// Mocked so the panel's expand-on-open never fires a real Supabase call.
vi.mock('./useShares', () => ({
  useShares: vi.fn().mockReturnValue({
    shares: [],
    isLoading: false,
    isSharing: false,
    isRevoking: false,
    reload: vi.fn().mockResolvedValue([]),
    createShare: vi.fn(),
    revokeShare: vi.fn(),
    leaveShare: vi.fn(),
  }),
}));

// The real hook: with no session, exportCategory rejects before any Supabase call.
function categories(overrides: Partial<UseCategories> = {}): UseCategories {
  return {
    categories: [{ id: 'a', name: 'Coins', user_id: 'owner-1' }],
    isLoading: false,
    isCreating: false,
    isDeleting: false,
    isRenaming: false,
    reload: () => {},
    createCategory: async () => null,
    renameCategory: async () => {},
    deleteCategory: () => {},
    optimisticRemove: () => null,
    ...overrides,
  } as UseCategories;
}

describe('exporting with no session', () => {
  beforeEach(() => {
    // Cleared, not assumed empty: getSession() finds no session only if nothing is persisted.
    window.localStorage.clear();
    window.localStorage.setItem('lang', 'en');
  });

  it('reports the failure and re-enables the button, without hanging as "exporting" forever', async () => {
    renderSelect({ categories: categories() });
    await openPanel();

    const exportButton = screen.getByRole('button', { name: 'Export' });
    expect(exportButton).toBeEnabled();
    await userEvent.click(exportButton);

    expect(
      await screen.findByText(
        'Could not export this collection. Please try again.',
      ),
    ).toBeVisible();
    expect(exportButton).toBeEnabled();
    expect(exportButton).toHaveAttribute('aria-busy', 'false');
  });
});
