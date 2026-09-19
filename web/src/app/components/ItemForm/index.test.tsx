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

describe('ItemForm submission', () => {
  function renderWithSubmit(initial: ItemFormValues = EMPTY_ITEM_FORM_VALUES) {
    const onSubmit = vi.fn();
    render(
      <I18nProvider>
        <ItemForm
          initial={initial}
          submitLabel="Save"
          onSubmit={onSubmit}
          onDirtyChange={vi.fn()}
        />
      </I18nProvider>,
    );
    return { onSubmit };
  }

  it('refuses to submit an entry with no title, and says which field is wrong', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderWithSubmit();

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Title is required.')).toBeVisible();
    const title = screen.getByLabelText(/title/i);
    expect(title).toHaveFocus();
    expect(title).toHaveAttribute('aria-invalid', 'true');
  });

  // Coordinates come from the place autocomplete, and an entry edited
  // without touching its place must keep the ones it already had.
  it('carries the coordinates of an untouched place through a save', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderWithSubmit({
      ...EMPTY_ITEM_FORM_VALUES,
      title: 'Seated Dime',
      place: 'Bonn',
      place_lat: 50.7,
      place_lng: 7.1,
    });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ place_lat: 50.7, place_lng: 7.1 }),
    );
  });

  it('drops stale coordinates once the place is hand-edited', async () => {
    // Typing a long-enough query kicks off PlaceAutocomplete's own
    // (debounced) search -- stubbed here so the test never reaches the
    // real network, matching PlaceAutocomplete.test.tsx's own setup.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ features: [] }) }),
    );
    try {
      const user = userEvent.setup();
      const { onSubmit } = renderWithSubmit({
        ...EMPTY_ITEM_FORM_VALUES,
        title: 'Seated Dime',
        place: 'Bonn',
        place_lat: 50.7,
        place_lng: 7.1,
      });

      await user.type(screen.getByRole('combobox'), 'x');
      await user.click(screen.getByRole('button', { name: 'Save' }));

      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          place: 'Bonnx',
          place_lat: null,
          place_lng: null,
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('submits no coordinates for an entry that never had any', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderWithSubmit({
      ...EMPTY_ITEM_FORM_VALUES,
      title: 'Seated Dime',
    });

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ place_lat: null, place_lng: null }),
    );
  });

  // ItemFormValues types every field as required, but a value assembled from
  // a partially-loaded record could still hand this a nullish field at
  // runtime -- each one should fall back the same way an actually-blank
  // value would, not throw or render "undefined".
  it('falls back to blank values for a nullish title, description, place, or tags', () => {
    renderForm({
      ...EMPTY_ITEM_FORM_VALUES,
      title: undefined,
      description: undefined,
      place: undefined,
      tags: undefined,
    } as unknown as ItemFormValues);

    expect(screen.getByTestId('item-title')).toHaveValue('');
    expect(screen.getByTestId('item-description')).toHaveValue('');
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.getByText('0 tags')).toBeInTheDocument();
  });
});

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
