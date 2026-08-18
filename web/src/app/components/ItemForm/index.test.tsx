// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import ItemForm from './index';
import { EMPTY_ITEM_FORM_VALUES } from './types';
import type { ItemFormValues } from './types';

function renderForm(
  initial: ItemFormValues = EMPTY_ITEM_FORM_VALUES,
  onDirtyChange = vi.fn(),
) {
  render(
    <I18nProvider>
      <ItemForm
        initial={initial}
        submitLabel="Save"
        onSubmit={vi.fn()}
        onDirtyChange={onDirtyChange}
      />
    </I18nProvider>,
  );
  return { onDirtyChange };
}

// Callers need to know when the form has anything worth losing, so they can
// confirm before a backdrop tap or Escape discards it.
describe('ItemForm dirty tracking', () => {
  it('reports not dirty on mount, for a blank form', () => {
    const { onDirtyChange } = renderForm();
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('reports dirty once a field diverges from initial', async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = renderForm();
    onDirtyChange.mockClear();

    await user.type(screen.getByTestId('item-title'), 'Roman coin');

    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });

  it('reports not dirty once the field is edited back to its initial value', async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = renderForm();

    const title = screen.getByTestId('item-title');
    await user.type(title, 'x');
    expect(onDirtyChange).toHaveBeenLastCalledWith(true);

    await user.clear(title);
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('reports not dirty on mount when editing an item, before anything changes', () => {
    const { onDirtyChange } = renderForm({
      title: 'Roman coin',
      description: 'Found at a flea market',
      place: '',
      place_lat: null,
      place_lng: null,
      tags: ['coins'],
    });
    expect(onDirtyChange).toHaveBeenLastCalledWith(false);
  });

  it('reports dirty when an edited item’s field is changed from its loaded value', async () => {
    const user = userEvent.setup();
    const { onDirtyChange } = renderForm({
      title: 'Roman coin',
      description: '',
      place: '',
      place_lat: null,
      place_lng: null,
      tags: [],
    });
    onDirtyChange.mockClear();

    await user.type(screen.getByTestId('item-description'), 'A note');

    expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  });
});
