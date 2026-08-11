// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import CategorySelect from './index';
import type { UseCategories } from './useCategories';

// Not what this file is testing (see the comment below) -- mocked to keep
// the panel's expand-on-open from firing a real, unmocked Supabase call
// the same way index.test.tsx does.
vi.mock('./useShares', () => ({
  useShares: vi.fn().mockReturnValue({
    shares: [],
    isLoading: false,
    isSharing: false,
    isRevoking: false,
    reload: vi.fn().mockResolvedValue([]),
    createShare: vi.fn(),
    deleteShare: vi.fn(),
  }),
}));

// #423: neither the catch->toast.error path nor the finally->reset in
// useExportCategory, nor the wiring that hands the click to it, was
// asserted anywhere -- index.test.tsx mocks the hook away entirely to keep
// the rest of that file's tests from having to coax a real export into a
// mid-flight state. This is the one test that runs the real hook instead:
// with no signed-in session, `exportCategory` rejects with "No user
// session" before any Supabase/storage call, which is enough to exercise
// the click -> catch -> error toast -> button re-enabled path with zero new
// mocks.

function categories(overrides: Partial<UseCategories> = {}): UseCategories {
  return {
    cats: [{ id: 'a', name: 'Coins', user_id: 'owner-1' }],
    isLoading: false,
    isCreating: false,
    isDeleting: false,
    isRenaming: false,
    reload: () => {},
    createCategory: async () => null,
    renameCategory: async () => {},
    deleteCategory: async () => true,
    ...overrides,
  } as UseCategories;
}

function renderSelect() {
  render(
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <CategorySelect
            selectedCat="a"
            onSelect={() => {}}
            categories={categories()}
            userId="owner-1"
          />
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

describe('exporting with no session', () => {
  beforeEach(() => {
    // Cleared rather than assumed empty: what makes the real client's
    // `getSession()` resolve with no session -- and so the export fail --
    // is that no session is persisted under it, not just the absence of one
    // set by this test file itself.
    window.localStorage.clear();
    window.localStorage.setItem('lang', 'en');
  });

  it('reports the failure and re-enables the button, without hanging as "exporting" forever', async () => {
    renderSelect();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open category' }),
    );

    const exportButton = screen.getByRole('button', { name: 'Export' });
    expect(exportButton).toBeEnabled();
    await userEvent.click(exportButton);

    expect(
      await screen.findByText(
        'Could not export this category. Please try again.',
      ),
    ).toBeVisible();
    expect(exportButton).toBeEnabled();
    expect(exportButton).toHaveAttribute('aria-busy', 'false');
  });
});
