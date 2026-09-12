// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import CategorySelect from './index';
import type { UseCategories } from './useCategories';

vi.mock('./useShares', () => ({
  useShares: vi.fn().mockReturnValue({
    shares: [],
    isLoading: false,
    isSharing: false,
    isRevoking: false,
    isUpdatingRole: false,
    reload: vi.fn().mockResolvedValue([]),
    createShare: vi.fn(),
    deleteShare: vi.fn(),
    updateShareRole: vi.fn(),
  }),
}));

vi.mock('../../data/categories', () => ({ countItemsForCategory: vi.fn() }));

const CATS = [
  { id: 'a', name: 'Coins', user_id: 'owner-1' },
  { id: 'b', name: 'Stamps', user_id: 'owner-1' },
];

function categories(overrides: Partial<UseCategories> = {}): UseCategories {
  return {
    cats: CATS,
    isLoading: false,
    isCreating: false,
    isDeleting: false,
    isRenaming: false,
    reload: vi.fn().mockResolvedValue(CATS),
    createCategory: vi.fn().mockResolvedValue(null),
    renameCategory: vi.fn(),
    deleteCategory: vi.fn(),
    optimisticRemove: vi.fn(() => vi.fn()),
    ...overrides,
  };
}

function renderSelect(
  props: Partial<Parameters<typeof CategorySelect>[0]> = {},
) {
  const onSelect = vi.fn();
  const view = render(
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <CategorySelect
            selectedCat="a"
            onSelect={onSelect}
            categories={categories()}
            userId="owner-1"
            {...props}
          />
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>,
  );
  return { onSelect, view };
}

async function openPanel() {
  await userEvent.click(
    screen.getByRole('button', { name: 'Open collection' }),
  );
}

describe('the category panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.setItem('lang', 'en');
  });

  describe('renaming', () => {
    it('sends the new name once the field differs from the current one', async () => {
      const renameCategory = vi.fn<UseCategories['renameCategory']>();
      renderSelect({ categories: categories({ renameCategory }) });
      await openPanel();

      const field = screen.getByLabelText('Rename');
      await userEvent.clear(field);
      await userEvent.type(field, 'Münzen');
      await userEvent.click(screen.getByRole('button', { name: 'Save name' }));

      expect(renameCategory).toHaveBeenCalledWith('a', 'Münzen');
    });

    it('sends nothing while the field still holds the current name', async () => {
      const renameCategory = vi.fn<UseCategories['renameCategory']>();
      renderSelect({ categories: categories({ renameCategory }) });
      await openPanel();

      expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
      expect(renameCategory).not.toHaveBeenCalled();
    });

    it('renames on Enter, without reaching for the button', async () => {
      const renameCategory = vi.fn<UseCategories['renameCategory']>();
      renderSelect({ categories: categories({ renameCategory }) });
      await openPanel();

      const field = screen.getByLabelText('Rename');
      await userEvent.clear(field);
      await userEvent.type(field, 'Münzen{Enter}');

      expect(renameCategory).toHaveBeenCalledWith('a', 'Münzen');
    });

    // First Escape discards the edit; only a second one, with nothing left
    // to discard, closes the panel.
    it('discards an edit on Escape before closing the panel', async () => {
      renderSelect();
      await openPanel();

      const field = screen.getByLabelText('Rename');
      await userEvent.clear(field);
      await userEvent.type(field, 'Münzen{Escape}');
      expect(field).toHaveValue('Coins');
      expect(screen.getByLabelText('Rename')).toBeVisible();

      await userEvent.type(field, '{Escape}');
      expect(screen.queryByLabelText('Rename')).not.toBeInTheDocument();
    });
  });

  describe('creating', () => {
    it('selects the new category and closes the panel', async () => {
      const createCategory = vi
        .fn<UseCategories['createCategory']>()
        .mockResolvedValue({ id: 'c', name: 'Cameras', user_id: 'owner-1' });
      const { onSelect } = renderSelect({
        categories: categories({ createCategory }),
      });
      await openPanel();

      await userEvent.type(screen.getByLabelText('New collection'), 'Cameras');
      await userEvent.click(screen.getByRole('button', { name: 'Add' }));

      expect(createCategory).toHaveBeenCalledWith('Cameras');
      expect(onSelect).toHaveBeenCalledWith('c');
      expect(screen.queryByLabelText('New collection')).not.toBeInTheDocument();
    });

    it('keeps the panel open when the category could not be created', async () => {
      const createCategory = vi
        .fn<UseCategories['createCategory']>()
        .mockResolvedValue(null);
      const { onSelect } = renderSelect({
        categories: categories({ createCategory }),
      });
      await openPanel();

      await userEvent.type(screen.getByLabelText('New collection'), 'Cameras');
      await userEvent.click(screen.getByRole('button', { name: 'Add' }));

      expect(onSelect).not.toHaveBeenCalled();
      expect(screen.getByLabelText('New collection')).toBeVisible();
    });

    it('creates on Enter from the new-category field', async () => {
      const createCategory = vi
        .fn<UseCategories['createCategory']>()
        .mockResolvedValue(null);
      renderSelect({ categories: categories({ createCategory }) });
      await openPanel();

      await userEvent.type(
        screen.getByLabelText('New collection'),
        'Cameras{Enter}',
      );

      expect(createCategory).toHaveBeenCalledWith('Cameras');
    });
  });

  it('closes the panel again from its own Close button', async () => {
    renderSelect();
    await openPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByLabelText('Rename')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open collection' }),
    ).toBeVisible();
  });

  it('follows a selection that changes underneath it', async () => {
    const { view } = renderSelect({ selectedCat: null });
    expect(screen.getByLabelText('New collection')).toBeVisible();

    view.rerender(
      <I18nProvider>
        <ToastProvider>
          <ConfirmProvider>
            <CategorySelect
              selectedCat="a"
              onSelect={vi.fn()}
              categories={categories()}
              userId="owner-1"
            />
          </ConfirmProvider>
        </ToastProvider>
      </I18nProvider>,
    );

    expect(screen.queryByLabelText('New collection')).not.toBeInTheDocument();
  });
});
