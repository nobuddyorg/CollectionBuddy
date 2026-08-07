// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import {
  CATEGORY_TABPANEL_ID,
  CategorySelectDropdown,
  categoryTabId,
} from './Dropdown';

const sortedCats = [
  { id: 'a', name: 'Coins' },
  { id: 'b', name: 'Stamps' },
  { id: 'c', name: 'Cards' },
];

function renderDropdown(
  props: Partial<Parameters<typeof CategorySelectDropdown>[0]> = {},
) {
  const onSelect = vi.fn();
  const setExpanded = vi.fn();
  render(
    <I18nProvider>
      <CategorySelectDropdown
        selectedCat="a"
        onSelect={onSelect}
        sortedCats={sortedCats}
        isLoading={false}
        setExpanded={setExpanded}
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

  // Roving tabindex: Tab should land on the selected tab and nowhere else,
  // so a screen reader's "1 of 3" announcement is the only tab stop it has
  // to walk through, not all three.
  it('gives only the selected tab a tab stop', () => {
    renderDropdown({ selectedCat: 'b' });
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
    renderDropdown({ selectedCat: null });
    expect(screen.getByRole('tab', { name: 'Coins' })).toHaveAttribute(
      'tabIndex',
      '0',
    );
  });

  it('points each tab at the shared entries panel', () => {
    renderDropdown();
    for (const c of sortedCats) {
      const tab = screen.getByRole('tab', { name: c.name });
      expect(tab).toHaveAttribute('aria-controls', CATEGORY_TABPANEL_ID);
      expect(tab).toHaveAttribute('id', categoryTabId(c.id));
    }
  });

  // ArrowRight/ArrowLeft move both focus and the selection -- the keyboard
  // model a "tab, 1 of 3, selected" announcement promises.
  it('moves focus and selection with ArrowRight, wrapping past the last tab', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderDropdown({ selectedCat: 'a' });
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
    const { onSelect } = renderDropdown({ selectedCat: 'a' });
    screen.getByRole('tab', { name: 'Coins' }).focus();

    await user.keyboard('{ArrowLeft}');
    expect(onSelect).toHaveBeenLastCalledWith('c');
  });

  it('jumps to the first and last tab with Home and End', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderDropdown({ selectedCat: 'b' });
    screen.getByRole('tab', { name: 'Stamps' }).focus();

    await user.keyboard('{End}');
    expect(onSelect).toHaveBeenLastCalledWith('c');

    await user.keyboard('{Home}');
    expect(onSelect).toHaveBeenLastCalledWith('a');
  });

  // Arrow navigation is exploratory and should leave the panel open for
  // more of it; only an explicit click on a tab is a "done choosing" that
  // collapses the strip.
  it('does not collapse the panel while arrowing between tabs', async () => {
    const user = userEvent.setup();
    const { setExpanded } = renderDropdown({ selectedCat: 'a' });
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

  // After an arrow key, focus should follow onto the newly-selected tab's
  // own DOM node, not stay behind on the one that lost the roving index.
  it('moves DOM focus onto the newly selected tab', async () => {
    const user = userEvent.setup();
    renderDropdown({ selectedCat: 'a' });
    screen.getByRole('tab', { name: 'Coins' }).focus();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Stamps' })).toHaveFocus();
  });
});
