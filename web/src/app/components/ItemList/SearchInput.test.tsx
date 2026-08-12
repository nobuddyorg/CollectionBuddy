// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { SearchInput } from './SearchInput';

// The clear button is the whole reason this is a component rather than an
// input: the browser draws its own inside a search field, unlabelled and with
// no touch target, and globals.css suppresses it so this one can take over
// (#233). A silent regression here leaves a search bar with no way to empty
// it on a phone.
function renderSearch(value = '') {
  const onChange = vi.fn();
  render(
    <I18nProvider>
      <SearchInput value={value} onChange={onChange} />
    </I18nProvider>,
  );
  return { onChange, field: screen.getByRole('searchbox') };
}

const clearButton = () => screen.queryByRole('button', { name: /clear/i });

describe('SearchInput', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
  });

  it('reports what is typed into it', async () => {
    const user = userEvent.setup();
    const { onChange, field } = renderSearch();

    await user.type(field, 'c');
    expect(onChange).toHaveBeenCalledWith('c');
  });

  it('shows what it was given', () => {
    const { field } = renderSearch('coin');
    expect(field).toHaveValue('coin');
  });

  // Nothing to clear, nothing to offer -- and a button that does nothing is
  // one more thing between a thumb and the field.
  it('offers no way to clear an empty field', () => {
    renderSearch('');
    expect(clearButton()).toBeNull();
  });

  it('offers a way to clear a field with something in it', () => {
    renderSearch('coin');
    expect(clearButton()).not.toBeNull();
  });

  it('empties the field when that is pressed', async () => {
    const user = userEvent.setup();
    const { onChange } = renderSearch('coin');

    await user.click(clearButton()!);
    expect(onChange).toHaveBeenCalledWith('');
  });

  // Named, unlike the browser's own glyph, so it can be reached and
  // understood without sight.
  it('names the clear button for a screen reader', () => {
    renderSearch('coin');
    expect(clearButton()).toHaveAccessibleName(/clear/i);
  });

  // Regression: the button's own box was centred in the field, but its
  // icon was not centred within the button, so the × sat off the field's
  // vertical centre.
  it('centres the clear icon within its button', () => {
    renderSearch('coin');
    for (const cls of ['items-center', 'justify-center']) {
      expect(clearButton()!.className).toContain(cls);
    }
  });

  it('names the field itself, which has no visible label', () => {
    const { field } = renderSearch();
    expect(field).toHaveAccessibleName(/search/i);
  });

  // `type="search"` is what tells a phone keyboard to offer a search key, and
  // what the CSS suppressing the native clear button selects on.
  it('is a search field, not a text field', () => {
    const { field } = renderSearch();
    expect(field).toHaveAttribute('type', 'search');
  });
});
