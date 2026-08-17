// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { countItemsForCategory } from '../../data/categories';
import CategorySelect from './index';
import type { UseCategories } from './useCategories';
import { useExportCategory } from './useExportCategory';
import { useImportCategory } from './useImportCategory';
import { useShares } from './useShares';

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

// Same reasoning as useExportCategory above: the real hook reads a ZIP and
// drives an actual importCategory() call, more than this file needs to
// control the button/progress wiring.
vi.mock('./useImportCategory', () => ({
  useImportCategory: vi.fn(),
}));

// Same reasoning again: the real hook round-trips through Supabase
// (data/shares.ts), which this file has no client configured for. What's
// under test here is the owned/shared branch in index.tsx, not the CRUD
// calls useShares.test.tsx already covers.
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

// user_id 'owner-1' matches renderSelect's default userId prop, so these
// two read as owned by the viewer unless a test overrides one or the
// other -- the same "shared" branch (index.tsx's isShared) a mismatch
// between the two would otherwise trigger by accident.
const cats = [
  { id: 'a', name: 'Coins', user_id: 'owner-1' },
  { id: 'b', name: 'Stamps', user_id: 'owner-1' },
];

function categories(overrides: Partial<UseCategories> = {}): UseCategories {
  return {
    cats,
    isLoading: false,
    isCreating: false,
    isDeleting: false,
    isRenaming: false,
    reload: vi.fn().mockResolvedValue(cats),
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

// The name line of the header, as distinct from the same name appearing
// on a tab or in the rename field once the panel is open.
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

  // Regression: the header used to read `cats`/`selectedCat` immediately,
  // so it showed "None selected" for one render before the page's own
  // initial load had resolved a real selection.
  it('holds the header on a placeholder instead of "None selected" while not ready', () => {
    renderSelect({ ready: false });
    expect(heading()).toBeVisible();
    expect(screen.queryByText('None selected')).not.toBeInTheDocument();
  });

  // Regression: opening the panel used to drop the collection's name and
  // draw the close button at a different height from the pencil, so every
  // toggle moved the heading down, the button up, and everything below by
  // the difference.
  it('keeps the same header when the panel is opened', async () => {
    renderSelect();
    const before = heading().parentElement?.parentElement;

    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
    );

    // Same heading, same name, same enclosing row -- only the glyph in the
    // button slot has changed.
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

  // Laid out row by row, the new-category field came out wider than the
  // rename field by exactly the delete button the rename row carries and
  // it does not. One grid for both rows -- both rows' leading column is the
  // same track -- is what makes them equal, regardless of what each row's
  // trailing icon buttons occupy.
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

  it('offers the export under a rule of its own, away from delete', async () => {
    renderSelect();
    await userEvent.click(
      screen.getByRole('button', { name: 'Open collection' }),
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
      screen.getByRole('button', { name: 'Open collection' }),
    );
    // One line, not two: the progress messages that replace this are all
    // one line, and a hint that wrapped would shrink the row on the way in.
    expect(screen.getByText('Photos, JSON and CSV.')).toBeVisible();
  });

  describe('import', () => {
    it('offers import independently of a category being selected', async () => {
      // No selection at all -- the panel starts expanded in this state
      // (nothing to collapse to), so there's no "Open collection" toggle to
      // click first.
      renderSelect({ selectedCat: null, categories: categories({ cats }) });

      const importButton = screen.getByRole('button', { name: 'Import' });
      expect(importButton).toBeVisible();
      expect(importButton).toBeEnabled();
    });

    it('says what a file needs to be while nothing is running', async () => {
      renderSelect();
      await userEvent.click(
        screen.getByRole('button', { name: 'Open collection' }),
      );
      expect(
        screen.getByText('A .zip archive exported from CollectionBuddy.'),
      ).toBeVisible();
    });

    it('opens the file picker when Import is clicked, not on page load', async () => {
      renderSelect();
      await userEvent.click(
        screen.getByRole('button', { name: 'Open collection' }),
      );
      const input = screen.getByTestId('import-file-input');
      const click = vi.spyOn(input, 'click');

      await userEvent.click(screen.getByRole('button', { name: 'Import' }));

      expect(click).toHaveBeenCalledTimes(1);
    });

    it('runs the import with the picked file, and switches to the new category', async () => {
      const runImport = vi.fn(
        async (_file: File, onImported?: (id: string) => void) => {
          onImported?.('new-cat-id');
        },
      );
      vi.mocked(useImportCategory).mockReturnValue(importState({ runImport }));
      const { onSelect } = renderSelect();
      await userEvent.click(
        screen.getByRole('button', { name: 'Open collection' }),
      );

      const file = new File(['zip bytes'], 'coins.zip', {
        type: 'application/zip',
      });
      const input = screen.getByTestId('import-file-input');
      await userEvent.upload(input, file);

      expect(runImport).toHaveBeenCalledWith(file, expect.any(Function));
      expect(onSelect).toHaveBeenCalledWith('new-cat-id');
    });

    // Regression (#510): the imported category is created out from under
    // this component (see useImportCategory.tsx), so `cats` never picked
    // it up on its own -- selecting it while it's still missing showed
    // "no category selected" and stayed that way until the next login
    // reloaded the list from scratch. reload() has to run first so the
    // category exists to select by the time onSelect names it.
    it('reloads the category list before selecting the imported category', async () => {
      const calls: string[] = [];
      const reload = vi.fn(async () => {
        calls.push('reload');
        return cats;
      });
      const runImport = vi.fn(
        async (_file: File, onImported?: (id: string) => void) => {
          onImported?.('new-cat-id');
        },
      );
      vi.mocked(useImportCategory).mockReturnValue(importState({ runImport }));
      const { onSelect } = renderSelect({ categories: categories({ reload }) });
      vi.mocked(onSelect).mockImplementation(() => calls.push('select'));
      await userEvent.click(
        screen.getByRole('button', { name: 'Open collection' }),
      );

      const file = new File(['zip bytes'], 'coins.zip', {
        type: 'application/zip',
      });
      const input = screen.getByTestId('import-file-input');
      await userEvent.upload(input, file);

      expect(reload).toHaveBeenCalled();
      expect(calls).toEqual(['reload', 'select']);
    });

    describe('while an import is running', () => {
      it('disables the import button and shows its progress message', async () => {
        vi.mocked(useImportCategory).mockReturnValue(
          importState({ isImporting: true, message: 'Photographs 3 of 9…' }),
        );
        renderSelect();
        await userEvent.click(
          screen.getByRole('button', { name: 'Open collection' }),
        );

        expect(screen.getByRole('button', { name: 'Import' })).toBeDisabled();
        expect(screen.getByText('Photographs 3 of 9…')).toBeVisible();
      });

      it('offers a Cancel affordance, absent while nothing is running', async () => {
        const cancelImport = vi.fn();
        vi.mocked(useImportCategory).mockReturnValue(
          importState({
            isImporting: true,
            message: 'Photographs 3 of 9…',
            cancelImport,
          }),
        );
        renderSelect();
        await userEvent.click(
          screen.getByRole('button', { name: 'Open collection' }),
        );

        const cancel = screen.getByRole('button', { name: 'Cancel import' });
        expect(cancel).toBeVisible();
        await userEvent.click(cancel);
        expect(cancelImport).toHaveBeenCalledOnce();
      });
    });
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
        screen.getByRole('button', { name: 'Open collection' }),
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
        screen.getByRole('button', { name: 'Open collection' }),
      );

      const cancel = screen.getByRole('button', { name: 'Cancel export' });
      await userEvent.click(cancel);
      expect(cancelExport).toHaveBeenCalledTimes(1);
    });

    it('does not offer Cancel while no export is running', async () => {
      renderSelect();
      await userEvent.click(
        screen.getByRole('button', { name: 'Open collection' }),
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
      screen.queryByRole('button', { name: 'Open collection' }),
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
        screen.getByRole('button', { name: 'Open collection' }),
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
        screen.getByRole('button', { name: 'Open collection' }),
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
        screen.getByRole('button', { name: 'Open collection' }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(
        await screen.findByText(
          'Delete "Coins"? Its entries and all their photographs will be permanently deleted. This cannot be undone.',
        ),
      ).toBeVisible();
    });
  });

  // #483: a category shown here can now be someone else's, shared read-only
  // rather than created by the viewer. user_id -- the one field
  // listCategories() (data/categories.ts) added specifically so the client
  // can tell the two apart -- is what every test below turns to make "a" a
  // category owned by someone other than renderSelect's default userId.
  describe('a shared category', () => {
    const sharedCats = [
      { id: 'a', name: 'Coins', user_id: 'other-owner' },
      { id: 'b', name: 'Stamps', user_id: 'owner-1' },
    ];

    it('marks the shared tab, but not one the viewer owns', async () => {
      renderSelect({ categories: categories({ cats: sharedCats }) });
      await userEvent.click(
        screen.getByRole('button', { name: 'Open collection' }),
      );

      const sharedTab = screen.getByRole('tab', { name: /Coins/ });
      expect(
        within(sharedTab).getByRole('img', { name: 'Shared with you' }),
      ).toBeInTheDocument();

      const ownedTab = screen.getByRole('tab', { name: 'Stamps' });
      expect(
        within(ownedTab).queryByRole('img', { name: 'Shared with you' }),
      ).not.toBeInTheDocument();
    });

    it('shows the name disabled rather than offering to rename it', async () => {
      renderSelect({ categories: categories({ cats: sharedCats }) });
      await userEvent.click(
        screen.getByRole('button', { name: 'Open collection' }),
      );

      const rename = screen.getByLabelText('Rename');
      expect(rename).toHaveValue('Coins');
      expect(rename).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Save name' })).toBeDisabled();
    });

    it('does not offer sharing controls for a category the viewer does not own', async () => {
      renderSelect({ categories: categories({ cats: sharedCats }) });
      await userEvent.click(
        screen.getByRole('button', { name: 'Open collection' }),
      );
      expect(
        screen.queryByLabelText('Share with (email)'),
      ).not.toBeInTheDocument();
    });

    // #483 follow-up: exportCategory() (data/exportCategory.ts) resolves
    // the *caller's own* uid to build each item's storage prefix -- for a
    // grantee that's the wrong prefix entirely, not the owner's. Disabled
    // rather than absent, same slot as everything else in this panel.
    it('disables export rather than offering a broken one', async () => {
      renderSelect({ categories: categories({ cats: sharedCats }) });
      await userEvent.click(
        screen.getByRole('button', { name: 'Open collection' }),
      );
      expect(screen.getByRole('button', { name: 'Export' })).toBeDisabled();
    });

    // Delete stays in the same slot for a shared category, but ends only
    // the viewer's own access (deleteShare on their own grant row) rather
    // than the category itself (deleteCategory) -- and says so before it
    // happens, with different copy from the owned-category confirmation
    // tested above.
    it('leaves instead of deleting, with different confirm copy, and falls through to what is left', async () => {
      const deleteShare = vi.fn().mockResolvedValue(true);
      const deleteCategory = vi.fn();
      vi.mocked(useShares).mockReturnValue(
        sharesState({
          shares: [
            {
              id: 'share-1',
              invited_email: 'me@example.com',
              expires_at: null,
              owner_user_id: 'other-owner',
              role: 'viewer',
            },
          ],
          deleteShare,
        }),
      );
      const { onSelect } = renderSelect({
        categories: categories({ cats: sharedCats, deleteCategory }),
      });
      await userEvent.click(
        screen.getByRole('button', { name: 'Open collection' }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(
        await screen.findByText(
          'Leave "Coins"? You\'ll stop seeing it. The owner\'s copy is unaffected.',
        ),
      ).toBeVisible();

      await userEvent.click(screen.getByTestId('confirm-accept'));

      expect(deleteShare).toHaveBeenCalledWith('share-1');
      expect(deleteCategory).not.toHaveBeenCalled();
      expect(onSelect).toHaveBeenCalledWith('b');
    });
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
