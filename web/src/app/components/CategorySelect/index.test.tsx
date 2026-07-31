// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import CategorySelect from './index';
import type { UseCategories } from './useCategories';

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
  } as unknown as UseCategories;
}

function renderSelect(
  props: Partial<Parameters<typeof CategorySelect>[0]> = {},
) {
  const onSelect = vi.fn();
  render(
    <I18nProvider>
      <ConfirmProvider>
        <CategorySelect
          selectedCat="a"
          onSelect={onSelect}
          categories={categories()}
          {...props}
        />
      </ConfirmProvider>
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
