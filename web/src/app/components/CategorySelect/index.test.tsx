// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { countItemsForCategory } from '../../data/categories';
import CategorySelect from './index';
import type { UseCategories } from './useCategories';
import { useExportCategory } from './useExportCategory';

vi.mock('../../data/categories', () => ({
  countItemsForCategory: vi.fn(),
}));

// The real hook drives an actual exportCategory() call, which is more than
// this file needs to control: #419 and the Cancel affordance only depend
// on isExporting/cancelExport, so those are mocked directly rather than
// coaxing a real export into a mid-flight state.
vi.mock('./useExportCategory', () => ({
  useExportCategory: vi.fn(),
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

const cats = [
  { id: 'a', name: 'Coins' },
  { id: 'b', name: 'Stamps' },
];

function categories(overrides: Partial<UseCategories> = {}): UseCategories {
  return {
    cats,
    isLoading: false,
    isCreating: false,
    isDeleting: false,
    isRenaming: false,
    reload: vi.fn(),
    createCategory: vi.fn(),
    renameCategory: vi.fn(),
    deleteCategory: vi.fn(),
    ...overrides,
  };
}

function renderSelect(
  props: Partial<Parameters<typeof CategorySelect>[0]> = {},
) {
  const onSelect = vi.fn();
  render(
    // ToastProvider because export reports its failures there, the same
    // way the category actions around it already do.
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <CategorySelect
            selectedCat="a"
            onSelect={onSelect}
            categories={categories()}
            {...props}
          />
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>,
  );
  return { onSelect };
}

const heading = () => screen.getByRole('heading', { name: 'Category' });

// The name line of the header, as distinct from the same name appearing
// on a tab or in the rename field once the panel is open.
const headerName = () => heading().parentElement?.lastElementChild;

describe('CategorySelect', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    vi.mocked(useExportCategory).mockReturnValue(exportState());
  });

  it('names the selected category under the section label', () => {
    renderSelect();
    expect(heading()).toBeVisible();
    expect(headerName()).toHaveTextContent('Coins');
  });

  // Regression: opening the panel used to drop the collection's name and
  // draw the close button at a different height from the pencil, so every
  // toggle moved the heading down, the button up, and everything below by
  // the difference.
  it('keeps the same header when the panel is opened', async () => {
    renderSelect();
    const before = heading().parentElement?.parentElement;

    await userEvent.click(
      screen.getByRole('button', { name: 'Open category' }),
    );

    // Same heading, same name, same enclosing row -- only the glyph in the
    // button slot has changed.
    expect(heading()).toBeVisible();
    expect(headerName()).toHaveTextContent('Coins');
    expect(heading().parentElement?.parentElement).toBe(before);
    expect(screen.getByRole('button', { name: 'Close' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Open category' }),
    ).not.toBeInTheDocument();
  });

  it('draws the two toggles to the same box', async () => {
    renderSelect();
    const open = screen.getByRole('button', { name: 'Open category' });
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
      screen.getByRole('button', { name: 'Open category' }),
    );
    expect(screen.getByRole('tablist')).toBeVisible();
    expect(screen.getByLabelText('Rename')).toHaveValue('Coins');
    expect(screen.getByLabelText('New category')).toBeVisible();
  });

  // Regression (#356): Escape in the rename field used to only ever reset
  // the value, with no way to reach the panel-closing behaviour the
  // new-category field's Escape already had -- so the two adjacent fields
  // did different things for the same key, and the second one just ate
  // whatever was typed. Both fields now take the same two Escapes: first
  // clears the edit, second (nothing left to discard) closes the panel.
  describe('Escape in the rename field', () => {
    async function openAndEdit(text: string) {
      renderSelect();
      await userEvent.click(
        screen.getByRole('button', { name: 'Open category' }),
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

  // Laid out row by row, the new-category field came out wider than the
  // rename field by exactly the delete button the rename row carries and
  // it does not. One grid for both rows -- both rows' leading column is the
  // same track -- is what makes them equal, regardless of what each row's
  // trailing icon buttons occupy.
  it('gives the two fields the same column', async () => {
    renderSelect();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open category' }),
    );

    const rename = screen.getByLabelText('Rename');
    const create = screen.getByLabelText('New category');
    expect(rename.parentElement).toBe(create.parentElement);
    expect(rename.parentElement?.className).toContain('grid');

    // Both fields fill a single column of it.
    expect(rename.className).toContain('w-full');
    expect(create.className).toContain('w-full');
  });

  it('offers the export under a rule of its own, away from delete', async () => {
    renderSelect();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open category' }),
    );

    const exportButton = screen.getByRole('button', { name: 'Export' });
    expect(exportButton).toBeVisible();
    expect(exportButton).toBeEnabled();
    // Not a third control in the rename row: those edit the category, this
    // takes a copy of it, and a slip between the two is a deletion.
    expect(exportButton.parentElement).not.toBe(
      screen.getByRole('button', { name: 'Delete' }).parentElement,
    );
    expect(exportButton.parentElement?.className).toContain('border-t');
  });

  it('says what the export contains while it is not running', async () => {
    renderSelect();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open category' }),
    );
    // One line, not two: the progress messages that replace this are all
    // one line, and a hint that wrapped would shrink the row on the way in.
    expect(screen.getByText('Photos, JSON and CSV.')).toBeVisible();
  });

  // #419: Delete used to stay enabled through a running export, so
  // confirming it removed exactly the storage objects the export was still
  // reading -- each resulting 404 silently skipped, leaving both the
  // originals gone and the archive quietly missing photographs.
  describe('while an export is running', () => {
    it('disables delete and rename, not just the export button itself', async () => {
      vi.mocked(useExportCategory).mockReturnValue(
        exportState({ isExporting: true, message: 'Photographs 3 of 9…' }),
      );
      renderSelect();
      await userEvent.click(
        screen.getByRole('button', { name: 'Open category' }),
      );

      expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    });

    it('offers a Cancel affordance next to the progress line, absent while nothing is running', async () => {
      const cancelExport = vi.fn();
      vi.mocked(useExportCategory).mockReturnValue(
        exportState({
          isExporting: true,
          message: 'Photographs 3 of 9…',
          cancelExport,
        }),
      );
      renderSelect();
      await userEvent.click(
        screen.getByRole('button', { name: 'Open category' }),
      );

      const cancel = screen.getByRole('button', { name: 'Cancel export' });
      await userEvent.click(cancel);
      expect(cancelExport).toHaveBeenCalledTimes(1);
    });

    it('does not offer Cancel while no export is running', async () => {
      renderSelect();
      await userEvent.click(
        screen.getByRole('button', { name: 'Open category' }),
      );
      expect(
        screen.queryByRole('button', { name: 'Cancel export' }),
      ).not.toBeInTheDocument();
    });
  });

  // Nothing to take a copy of yet, so the row is absent rather than
  // present and disabled.
  it('offers no export when no category is selected', async () => {
    renderSelect({ selectedCat: null });
    expect(
      screen.queryByRole('button', { name: 'Export' }),
    ).not.toBeInTheDocument();
  });

  // On first run there is no collection to name and nothing to collapse
  // back to, so the header still holds its line and the slot stays empty.
  it('holds the header when nothing is selected', () => {
    renderSelect({ selectedCat: null });
    expect(heading()).toBeVisible();
    expect(headerName()).toHaveTextContent('None selected');
    expect(
      screen.queryByRole('button', { name: 'Close' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Open category' }),
    ).not.toBeInTheDocument();
  });

  // Regression: the delete confirmation used to read "Confirm deletion" in
  // full -- no category name, no entry count, no mention of photographs.
  // The trash sits right beside the rename field, and the deletion is
  // permanent, so the dialog now says what it is about to do.
  describe('the delete confirmation', () => {
    it('names the category and states the entry count when it holds entries', async () => {
      vi.mocked(countItemsForCategory).mockResolvedValue({
        count: 40,
        error: null,
      } as never);
      renderSelect();
      await userEvent.click(
        screen.getByRole('button', { name: 'Open category' }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(
        await screen.findByText(
          'Delete "Coins"? Its 40 entries and all their photographs will be permanently deleted. This cannot be undone.',
        ),
      ).toBeVisible();
    });

    it('does not claim entries or photographs will be lost when the category is empty', async () => {
      vi.mocked(countItemsForCategory).mockResolvedValue({
        count: 0,
        error: null,
      } as never);
      renderSelect();
      await userEvent.click(
        screen.getByRole('button', { name: 'Open category' }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(
        await screen.findByText('Delete "Coins"? This cannot be undone.'),
      ).toBeVisible();
    });

    it('falls back to a generic warning rather than claiming zero entries when the count is unknown', async () => {
      vi.mocked(countItemsForCategory).mockResolvedValue({
        count: null,
        error: new Error('network error'),
      } as never);
      renderSelect();
      await userEvent.click(
        screen.getByRole('button', { name: 'Open category' }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(
        await screen.findByText(
          'Delete "Coins"? Its entries and all their photographs will be permanently deleted. This cannot be undone.',
        ),
      ).toBeVisible();
    });
  });

  it('collapses onto the category picked from the tabs', async () => {
    const { onSelect } = renderSelect();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open category' }),
    );
    await userEvent.click(screen.getByRole('tab', { name: 'Stamps' }));
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });
});
