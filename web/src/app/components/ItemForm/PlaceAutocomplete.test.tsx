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

// Rendered inside a dialog with aria-modal="true": once that's in effect,
// content outside the dialog's DOM subtree is invisible to assistive tech
// no matter what aria-controls points at.
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

  // The row must render through formatDisplay so a countrycode-only feature
  // still shows a country, matching what dedupe considers the same entry.
  it('falls back to the country code when a feature has no country name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          features: [
            {
              properties: {
                osm_id: 3,
                osm_type: 'N',
                osm_key: 'place',
                osm_value: 'city',
                city: 'Strasbourg',
                countrycode: 'FR',
              },
              geometry: { type: 'Point', coordinates: [7.75, 48.58] },
            },
          ],
        }),
      }),
    );

    renderInDialog();
    const input = screen.getByRole('combobox');
    await userEvent.type(input, 'X');

    const option = await screen.findByRole('option');
    expect(option).toHaveTextContent('France');
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
