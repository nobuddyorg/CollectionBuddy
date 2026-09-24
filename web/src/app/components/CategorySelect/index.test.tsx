// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  categories,
  installHookStates,
  openPanel,
  renderSelect,
} from './index.test-support';

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

const heading = () => screen.getByRole('heading', { name: 'Collection' });

// The header's name line, as distinct from the same name on a tab or in the rename field.
const headerName = () => heading().parentElement?.lastElementChild;

describe('CategorySelect', () => {
  beforeEach(installHookStates);

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

    await openPanel();

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

    await openPanel();
    expect(screen.getByRole('tablist')).toBeVisible();
    expect(screen.getByLabelText('Rename')).toHaveValue('Coins');
    expect(screen.getByLabelText('New collection')).toBeVisible();
  });

  it('stops a rename at the 200 characters a category name may have', async () => {
    renderSelect();
    await openPanel();
    expect(screen.getByLabelText('Rename')).toHaveAttribute('maxlength', '200');
  });

  it('shows nothing selected when selectedCategoryId names a category not in the list', () => {
    renderSelect({ selectedCategoryId: 'not-a-real-id' });
    expect(screen.queryByText('None selected')).toBeInTheDocument();
  });

  it('does not rename on Enter when the value has not actually changed', async () => {
    const renameCategory = vi.fn();
    renderSelect({ categories: categories({ renameCategory }) });
    await openPanel();

    await userEvent.type(screen.getByLabelText('Rename'), '{Enter}');

    expect(renameCategory).not.toHaveBeenCalled();
  });

  it('does not create a category on Enter with no name typed', async () => {
    const createCategory = vi.fn();
    renderSelect({ categories: categories({ createCategory }) });
    await openPanel();

    await userEvent.type(screen.getByLabelText('New collection'), '{Enter}');

    expect(createCategory).not.toHaveBeenCalled();
  });

  describe('Escape in the rename field', () => {
    async function openAndEdit(text: string) {
      renderSelect();
      await openPanel();
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
    await openPanel();

    const rename = screen.getByLabelText('Rename');
    const create = screen.getByLabelText('New collection');
    expect(rename.parentElement).toBe(create.parentElement);
    expect(rename.parentElement?.className).toContain('grid');

    // Both fields fill a single column of it.
    expect(rename.className).toContain('w-full');
    expect(create.className).toContain('w-full');
  });

  it('holds the header when nothing is selected', () => {
    renderSelect({ selectedCategoryId: null });
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
    await openPanel();
    expect(screen.getByLabelText('Share with (email)')).toBeVisible();
  });

  it('collapses onto the category picked from the tabs', async () => {
    const { onSelect } = renderSelect();
    await openPanel();
    await userEvent.click(screen.getByRole('tab', { name: 'Stamps' }));
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});
