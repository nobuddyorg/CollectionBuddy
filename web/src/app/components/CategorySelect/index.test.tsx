// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import CategorySelect from './index';
import type { UseCategories } from './useCategories';
import { useExportCategory } from './useExportCategory';
import { useImportCategory } from './useImportCategory';
import { useShares } from './useShares';

vi.mock('../../data/categories', () => ({
  countItemsForCategory: vi.fn(),
}));

// The real hook drives an actual exportCategory() call; only its state matters here.
vi.mock('./useExportCategory', () => ({
  useExportCategory: vi.fn(),
}));

// The real hook reads a ZIP and drives an actual importCategory() call.
vi.mock('./useImportCategory', () => ({
  useImportCategory: vi.fn(),
}));

// The real hook round-trips through Supabase; useShares.test.tsx covers its CRUD.
vi.mock('./useShares', () => ({
  useShares: vi.fn(),
}));

function exportState(
  overrides: Partial<ReturnType<typeof useExportCategory>> = {},
) {
  return {
    progress: null,
    isExporting: false,
    message: null,
    runExport: vi.fn(),
    cancelExport: vi.fn(),
    ...overrides,
  };
}

function importState(
  overrides: Partial<ReturnType<typeof useImportCategory>> = {},
) {
  return {
    progress: null,
    isImporting: false,
    message: null,
    runImport: vi.fn(),
    cancelImport: vi.fn(),
    ...overrides,
  };
}

function sharesState(overrides: Partial<ReturnType<typeof useShares>> = {}) {
  return {
    shares: [],
    isLoading: false,
    isSharing: false,
    isRevoking: false,
    isUpdatingRole: false,
    reload: vi.fn().mockResolvedValue([]),
    createShare: vi.fn(),
    deleteShare: vi.fn(),
    updateShareRole: vi.fn(),
    ...overrides,
  };
}

// user_id 'owner-1' matches renderSelect's default userId, so both read as owned by the viewer.
const CATEGORIES = [
  { id: 'a', name: 'Coins', user_id: 'owner-1' },
  { id: 'b', name: 'Stamps', user_id: 'owner-1' },
];

function categories(overrides: Partial<UseCategories> = {}): UseCategories {
  return {
    cats: CATEGORIES,
    isLoading: false,
    isCreating: false,
    isDeleting: false,
    isRenaming: false,
    reload: vi.fn().mockResolvedValue(CATEGORIES),
    createCategory: vi.fn(),
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
  render(
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
  return { onSelect };
}

const heading = () => screen.getByRole('heading', { name: 'Collection' });

// The header's name line, as distinct from the same name on a tab or in the rename field.
const headerName = () => heading().parentElement?.lastElementChild;

describe('CategorySelect', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    vi.mocked(useExportCategory).mockReturnValue(exportState());
    vi.mocked(useImportCategory).mockReturnValue(importState());
    vi.mocked(useShares).mockReturnValue(sharesState());
  });

  it('names the selected category under the section label', () => {
    renderSelect();
    expect(heading()).toBeVisible();
    expect(headerName()).toHaveTextContent('Coins');
  });

  it('holds the header on a placeholder instead of "None selected" while not ready', () => {
    renderSelect({ ready: false });
    expect(heading()).toBeVisible();
    expect(screen.queryByText('None selected')).not.toBeInTheDocument();
  });

  it('keeps the same header when the panel is opened', async () => {
    renderSelect();
    const before = heading().parentElement?.parentElement;

    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );

    // Same heading, name and enclosing row; only the glyph in the button slot changed.
    expect(heading()).toBeVisible();
    expect(headerName()).toHaveTextContent('Coins');
    expect(heading().parentElement?.parentElement).toBe(before);
    expect(screen.getByRole('button', { name: 'Close' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Open collection' }),
    ).not.toBeInTheDocument();
  });

  it('draws the two toggles to the same box', async () => {
    renderSelect();
    const open = screen.getByRole('button', { name: 'Open collection' });
    const openClasses = open.className;
    await userEvent.click(open);
    const close = screen.getByRole('button', { name: 'Close' });
    for (const size of ['w-11', 'h-11', 'sm:w-9', 'sm:h-9', 'shrink-0']) {
      expect(openClasses).toContain(size);
      expect(close.className).toContain(size);
    }
  });

  it('reveals the category tabs and the fields only once opened', async () => {
    renderSelect();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );
    expect(screen.getByRole('tablist')).toBeVisible();
    expect(screen.getByLabelText('Rename')).toHaveValue('Coins');
    expect(screen.getByLabelText('New collection')).toBeVisible();
  });

  it('stops a rename at the 200 characters a category name may have', async () => {
    renderSelect();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );
    expect(screen.getByLabelText('Rename')).toHaveAttribute('maxlength', '200');
  });

  it('shows nothing selected when selectedCat names a category not in the list', () => {
    renderSelect({ selectedCat: 'not-a-real-id' });
    expect(screen.queryByText('None selected')).toBeInTheDocument();
  });

  it('does not rename on Enter when the value has not actually changed', async () => {
    const renameCategory = vi.fn();
    renderSelect({ categories: categories({ renameCategory }) });
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );

    await userEvent.type(screen.getByLabelText('Rename'), '{Enter}');

    expect(renameCategory).not.toHaveBeenCalled();
  });

  it('does not create a category on Enter with no name typed', async () => {
    const createCategory = vi.fn();
    renderSelect({ categories: categories({ createCategory }) });
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );

    await userEvent.type(screen.getByLabelText('New collection'), '{Enter}');

    expect(createCategory).not.toHaveBeenCalled();
  });

  describe('Escape in the rename field', () => {
    async function openAndEdit(text: string) {
      renderSelect();
      await userEvent.click(
        screen.getByRole('button', { name: 'Open collection' }),
      );
      const rename = screen.getByLabelText('Rename');
      await userEvent.clear(rename);
      await userEvent.type(rename, text);
      return rename;
    }

    it('resets an edit on the first Escape, without closing the panel', async () => {
      const rename = await openAndEdit('Coinage');
      await userEvent.type(rename, '{Escape}');

      expect(rename).toHaveValue('Coins');
      expect(screen.getByRole('tablist')).toBeVisible();
    });

    it('closes the panel on a second Escape, once the field already matches', async () => {
      const rename = await openAndEdit('Coinage');
      await userEvent.type(rename, '{Escape}{Escape}');

      expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    });
  });

  it('gives the two fields the same column', async () => {
    renderSelect();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );

    const rename = screen.getByLabelText('Rename');
    const create = screen.getByLabelText('New collection');
    expect(rename.parentElement).toBe(create.parentElement);
    expect(rename.parentElement?.className).toContain('grid');

    // Both fields fill a single column of it.
    expect(rename.className).toContain('w-full');
    expect(create.className).toContain('w-full');
  });

  it('holds the header when nothing is selected', () => {
    renderSelect({ selectedCat: null });
    expect(heading()).toBeVisible();
    expect(headerName()).toHaveTextContent('None selected');
    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open collection' }),
    ).not.toBeInTheDocument();
  });

  it('offers sharing controls for a category the viewer owns', async () => {
    renderSelect();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );
    expect(screen.getByLabelText('Share with (email)')).toBeVisible();
  });

  it('collapses onto the category picked from the tabs', async () => {
    const { onSelect } = renderSelect();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Stamps' }));
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});
