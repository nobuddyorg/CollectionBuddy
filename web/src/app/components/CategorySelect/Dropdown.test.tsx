// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import {
  CATEGORY_TABPANEL_ID,
  CategorySelectDropdown,
  categoryTabId,
} from './Dropdown';

// user_id 'owner-1' matches renderDropdown's default userId, so none read as shared.
const sortedCategories = [
  { id: 'a', name: 'Coins', user_id: 'owner-1' },
  { id: 'b', name: 'Stamps', user_id: 'owner-1' },
  { id: 'c', name: 'Cards', user_id: 'owner-1' },
];

function renderDropdown(
  props: Partial<Parameters<typeof CategorySelectDropdown>[0]> = {},
) {
  const onSelect = vi.fn();
  const onCollapse = vi.fn();
  render(
    <I18nProvider>
      <CategorySelectDropdown
        selectedCategoryId="a"
        onSelect={onSelect}
        sortedCategories={sortedCategories}
        isLoading={false}
        onCollapse={onCollapse}
        userId="owner-1"
        {...props}
      />
    </I18nProvider>,
  );
  return { onSelect, onCollapse };
}

describe('CategorySelectDropdown', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
  });

  it('renders a placeholder strip instead of tabs while loading', () => {
    renderDropdown({ isLoading: true });
    expect(
      screen.getByRole('status', { name: 'Loading…' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('renders nothing once loaded with no categories', () => {
    const { container } = render(
      <I18nProvider>
        <CategorySelectDropdown
          selectedCategoryId={null}
          onSelect={vi.fn()}
          sortedCategories={[]}
          isLoading={false}
          onCollapse={vi.fn()}
          userId="owner-1"
        />
      </I18nProvider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('gives only the selected tab a tab stop', () => {
    renderDropdown({ selectedCategoryId: 'b' });
    expect(screen.getByRole('tab', { name: 'Coins' })).toHaveAttribute(
      'tabIndex',
      '-1',
    );
    expect(screen.getByRole('tab', { name: 'Stamps' })).toHaveAttribute(
      'tabIndex',
      '0',
    );
    expect(screen.getByRole('tab', { name: 'Cards' })).toHaveAttribute(
      'tabIndex',
      '-1',
    );
  });

  it('falls back to the first tab as the stop when nothing is selected', () => {
    renderDropdown({ selectedCategoryId: null });
    expect(screen.getByRole('tab', { name: 'Coins' })).toHaveAttribute(
      'tabIndex',
      '0',
    );
  });

  it('points each tab at the shared entries panel', () => {
    renderDropdown();
    for (const category of sortedCategories) {
      const tab = screen.getByRole('tab', { name: category.name });
      expect(tab).toHaveAttribute('aria-controls', CATEGORY_TABPANEL_ID);
      expect(tab).toHaveAttribute('id', categoryTabId(category.id));
    }
  });

  const tab = (name: string) => screen.getByRole('tab', { name });

  it('moves focus with ArrowRight, wrapping past the last tab', async () => {
    const user = userEvent.setup();
    renderDropdown({ selectedCategoryId: 'a' });
    tab('Coins').focus();

    await user.keyboard('{ArrowRight}');
    expect(tab('Stamps')).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(tab('Cards')).toHaveFocus();

    await user.keyboard('{ArrowRight}');
    expect(tab('Coins')).toHaveFocus();
  });

  it('moves focus with ArrowLeft, wrapping before the first tab', async () => {
    const user = userEvent.setup();
    renderDropdown({ selectedCategoryId: 'a' });
    tab('Coins').focus();

    await user.keyboard('{ArrowLeft}');
    expect(tab('Cards')).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(tab('Stamps')).toHaveFocus();
  });

  it('jumps focus to the first and last tab with Home and End', async () => {
    const user = userEvent.setup();
    renderDropdown({ selectedCategoryId: 'b' });
    tab('Stamps').focus();

    await user.keyboard('{End}');
    expect(tab('Cards')).toHaveFocus();

    await user.keyboard('{Home}');
    expect(tab('Coins')).toHaveFocus();
  });

  // Each selection loads a collection, so arrowing past one must neither load it nor close the panel.
  it('neither selects nor collapses while arrowing between tabs', async () => {
    const user = userEvent.setup();
    const { onSelect, onCollapse } = renderDropdown({
      selectedCategoryId: 'a',
    });
    tab('Coins').focus();

    await user.keyboard('{ArrowRight}{ArrowLeft}{End}{Home}');

    expect(onSelect).not.toHaveBeenCalled();
    expect(onCollapse).not.toHaveBeenCalled();
    expect(tab('Coins')).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps the Tab stop on the selected tab while focus arrows away from it', async () => {
    const user = userEvent.setup();
    renderDropdown({ selectedCategoryId: 'a' });
    tab('Coins').focus();

    await user.keyboard('{ArrowRight}');

    expect(tab('Coins')).toHaveAttribute('tabIndex', '0');
    expect(tab('Stamps')).toHaveAttribute('tabIndex', '-1');
  });

  it('prevents the page scrolling on the keys it handles, and only those', () => {
    renderDropdown({ selectedCategoryId: 'a' });
    tab('Coins').focus();
    expect(fireEvent.keyDown(tab('Coins'), { key: 'ArrowDown' })).toBe(true);
    expect(tab('Coins')).toHaveFocus();

    for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) {
      expect(fireEvent.keyDown(tab('Coins'), { key })).toBe(false);
    }
  });

  it.each(['{Enter}', ' '])(
    'selects the focused tab and collapses the panel on %s',
    async (key) => {
      const user = userEvent.setup();
      const { onSelect, onCollapse } = renderDropdown({
        selectedCategoryId: 'a',
      });
      tab('Coins').focus();

      await user.keyboard(`{ArrowRight}${key}`);

      expect(onSelect).toHaveBeenCalledExactlyOnceWith('b');
      expect(onCollapse).toHaveBeenCalledOnce();
    },
  );

  it('selects and collapses the panel on a click', async () => {
    const user = userEvent.setup();
    const { onSelect, onCollapse } = renderDropdown();
    await user.click(tab('Stamps'));
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(onCollapse).toHaveBeenCalledOnce();
  });

  // user_id is the only thing distinguishing a shared tab from an owned one.
  it('marks a tab whose user_id does not match the viewer, and no other', () => {
    renderDropdown({
      sortedCategories: [
        { id: 'a', name: 'Coins', user_id: 'someone-else' },
        { id: 'b', name: 'Stamps', user_id: 'owner-1' },
      ],
    });

    const shared = screen.getByRole('tab', { name: /Coins/ });
    expect(
      within(shared).getByRole('img', { name: 'Shared with you' }),
    ).toBeInTheDocument();

    const owned = screen.getByRole('tab', { name: 'Stamps' });
    expect(
      within(owned).queryByRole('img', { name: 'Shared with you' }),
    ).not.toBeInTheDocument();
  });
});
