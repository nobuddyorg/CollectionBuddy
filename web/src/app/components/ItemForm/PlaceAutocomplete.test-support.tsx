import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';

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

// Inside aria-modal="true", content outside the dialog's subtree is invisible to assistive tech.
export function renderInDialog(value = 'Col') {
  const onChange = vi.fn();
  const view = render(
    <I18nProvider>
      <div role="dialog" aria-modal="true" data-testid="dialog">
        <PlaceAutocomplete value={value} onChange={onChange} />
      </div>
    </I18nProvider>,
  );
  return {
    onChange,
    dialog: screen.getByTestId('dialog'),
    unmount: view.unmount,
  };
}

export function installDefaultPlaceSearch() {
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
}
