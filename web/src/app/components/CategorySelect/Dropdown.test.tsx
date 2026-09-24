// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
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
  const setExpanded = vi.fn();
  render(
    <I18nProvider>
      <CategorySelectDropdown
        selectedCategoryId="a"
        onSelect={onSelect}
        sortedCategories={sortedCategories}
        isLoading={false}
        setExpanded={setExpanded}
        userId="owner-1"
        {...props}
      />
    </I18nProvider>,
  );
  return { onSelect, setExpanded };
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
          setExpanded={vi.fn()}
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

  it('moves focus and selection with ArrowRight, wrapping past the last tab', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderDropdown({ selectedCategoryId: 'a' });
    screen.getByRole('tab', { name: 'Coins' }).focus();

    await user.keyboard('{ArrowRight}');
    expect(onSelect).toHaveBeenLastCalledWith('b');

    await user.keyboard('{ArrowRight}');
    expect(onSelect).toHaveBeenLastCalledWith('c');

    await user.keyboard('{ArrowRight}');
    expect(onSelect).toHaveBeenLastCalledWith('a');
  });

  it('moves focus and selection with ArrowLeft, wrapping before the first tab', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderDropdown({ selectedCategoryId: 'a' });
    screen.getByRole('tab', { name: 'Coins' }).focus();

    await user.keyboard('{ArrowLeft}');
    expect(onSelect).toHaveBeenLastCalledWith('c');
  });

  it('jumps to the first and last tab with Home and End', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderDropdown({ selectedCategoryId: 'b' });
    screen.getByRole('tab', { name: 'Stamps' }).focus();

    await user.keyboard('{End}');
    expect(onSelect).toHaveBeenLastCalledWith('c');

    await user.keyboard('{Home}');
    expect(onSelect).toHaveBeenLastCalledWith('a');
  });

  // Arrow navigation is exploratory and must not collapse the panel; only a click does.
  it('does not collapse the panel while arrowing between tabs', async () => {
    const user = userEvent.setup();
    const { setExpanded } = renderDropdown({ selectedCategoryId: 'a' });
    screen.getByRole('tab', { name: 'Coins' }).focus();

    await user.keyboard('{ArrowRight}');
    expect(setExpanded).not.toHaveBeenCalled();
  });

  it('still collapses the panel on a click, as before', async () => {
    const user = userEvent.setup();
    const { onSelect, setExpanded } = renderDropdown();
    await user.click(screen.getByRole('tab', { name: 'Stamps' }));
    expect(onSelect).toHaveBeenCalledWith('b');
    expect(setExpanded).toHaveBeenCalledWith(false);
  });

  it('moves DOM focus onto the newly selected tab', async () => {
    const user = userEvent.setup();
    renderDropdown({ selectedCategoryId: 'a' });
    screen.getByRole('tab', { name: 'Coins' }).focus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Stamps' })).toHaveFocus();
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
