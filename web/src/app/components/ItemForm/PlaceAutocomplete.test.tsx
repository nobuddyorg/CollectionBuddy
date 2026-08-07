// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { PlaceAutocomplete } from './PlaceAutocomplete';
import type { PhotonFeature } from './types';

function feature(osm_id: number, city: string): PhotonFeature {
  return {
    properties: {
      osm_id,
      osm_type: 'N',
      osm_key: 'place',
      osm_value: 'city',
      city,
      country: 'Germany',
    },
    geometry: { type: 'Point', coordinates: [6.96, 50.94] },
  };
}

// The combobox lives inside a modal (`role="dialog" aria-modal="true"`),
// which is what makes the bug this component guards against reproducible:
// content outside the dialog's DOM subtree is invisible to assistive tech
// once `aria-modal` is in effect, no matter what `aria-controls` points at.
function renderInDialog(value = 'Col') {
  const onChange = vi.fn();
  render(
    <I18nProvider>
      <div role="dialog" aria-modal="true" data-testid="dialog">
        <PlaceAutocomplete value={value} onChange={onChange} />
      </div>
    </I18nProvider>,
  );
  return { onChange, dialog: screen.getByTestId('dialog') };
}

describe('PlaceAutocomplete', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [feature(1, 'Cologne'), feature(2, 'Colmar')],
        }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the listbox inside the dialog subtree rather than portaled to body', async () => {
    const { dialog } = renderInDialog();
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'X');

    const listbox = await screen.findByRole('listbox');
    expect(dialog.contains(listbox)).toBe(true);
    // Nothing about this component should ever land as a document.body
    // child sitting outside the dialog -- that's the bug being guarded.
    expect(listbox.parentElement).not.toBe(document.body);
  });

  it('keeps aria-controls and aria-activedescendant pointing at IDs that resolve inside the dialog', async () => {
    const { dialog } = renderInDialog();
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'X');
    await screen.findByRole('listbox');

    const controlsId = input.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    expect(dialog.querySelector(`#${controlsId}`)).not.toBeNull();

    await userEvent.keyboard('{ArrowDown}');

    await waitFor(() => {
      const activeId = input.getAttribute('aria-activedescendant');
      expect(activeId).toBeTruthy();
      expect(dialog.querySelector(`#${activeId}`)).not.toBeNull();
    });
  });

  it('highlights the active option via aria-selected as ArrowDown moves through the list', async () => {
    renderInDialog();
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'X');
    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(2);
    expect(options[0]).toHaveAttribute('aria-selected', 'false');

    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(options[0]).toHaveAttribute('aria-selected', 'true');
    });
    expect(options[1]).toHaveAttribute('aria-selected', 'false');

    await userEvent.keyboard('{ArrowDown}');
    await waitFor(() => {
      expect(options[1]).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('picks the active option on Enter and reports its coordinates', async () => {
    const { onChange } = renderInDialog();
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'X');
    await screen.findAllByRole('option');

    await userEvent.keyboard('{ArrowDown}{Enter}');

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        'Cologne, Germany',
        expect.objectContaining({ lat: 50.94, lng: 6.96 }),
      );
    });
  });

  it('closes the menu on Escape without letting the keystroke escape the component', async () => {
    renderInDialog();
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'X');
    await screen.findByRole('listbox');

    await userEvent.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });
});
