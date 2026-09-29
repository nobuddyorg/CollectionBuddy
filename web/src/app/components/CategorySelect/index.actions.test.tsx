// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { countItemsForCategory } from '../../data/categories';
import type CategorySelect from './index';
import type { UseCategories } from './useCategories';
import {
  categories as categoriesState,
  openPanel,
  renderSelect as renderCategorySelect,
  selectTree,
} from './index.test-support';
import { sharesState } from './shares.test-support';
import { useShares } from './useShares';

vi.mock('./useShares', () => ({ useShares: vi.fn() }));

vi.mock('../../data/categories', () => ({ countItemsForCategory: vi.fn() }));

function categories(overrides: Partial<UseCategories> = {}): UseCategories {
  return categoriesState({
    createCategory: vi.fn().mockResolvedValue(null),
    ...overrides,
  });
}

function renderSelect(
  props: Partial<Parameters<typeof CategorySelect>[0]> = {},
) {
  return renderCategorySelect({ categories: categories(), ...props });
}

describe('the category panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useShares).mockReturnValue(sharesState());
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

    // First Escape discards the edit; only a second one, with nothing left to discard, closes.
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
      expect(
        screen.getByRole('button', { name: 'Open collection' }),
      ).toHaveFocus();
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

  describe('deleting', () => {
    it('names the category and states the entry count when it holds entries', async () => {
      vi.mocked(countItemsForCategory).mockResolvedValue({
        count: 40,
        error: null,
      } as never);
      renderSelect();
      await openPanel();
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(
        await screen.findByText(
          'Delete "Coins"? Its 40 entries and all their photographs will be permanently deleted.',
        ),
      ).toBeVisible();
    });

    it('does not claim entries or photographs will be lost when the category is empty', async () => {
      vi.mocked(countItemsForCategory).mockResolvedValue({
        count: 0,
        error: null,
      } as never);
      renderSelect();
      await openPanel();
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(await screen.findByText('Delete "Coins"?')).toBeVisible();
    });

    it('falls back to a generic warning rather than claiming zero entries when the count is unknown', async () => {
      vi.mocked(countItemsForCategory).mockResolvedValue({
        count: null,
        error: new Error('network error'),
      } as never);
      renderSelect();
      await openPanel();
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(
        await screen.findByText(
          'Delete "Coins"? Its entries and all their photographs will be permanently deleted.',
        ),
      ).toBeVisible();
    });
  });

  it('closes the panel again from its own Close button', async () => {
    renderSelect();
    await openPanel();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByLabelText('Rename')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Open collection' }),
    ).toHaveFocus();
  });

  it('follows a selection that changes underneath it', async () => {
    const { view } = renderSelect({ selectedCategoryId: null });
    expect(screen.getByLabelText('New collection')).toBeVisible();

    view.rerender(selectTree({ categories: categories() }));

    expect(screen.queryByLabelText('New collection')).not.toBeInTheDocument();
    // Nobody pressed anything inside the panel, so focus stays where it was.
    expect(
      screen.getByRole('button', { name: 'Open collection' }),
    ).not.toHaveFocus();
  });
});
