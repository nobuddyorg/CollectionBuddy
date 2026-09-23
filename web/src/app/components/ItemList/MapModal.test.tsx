// @vitest-environment jsdom
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { usePlaces } from '../Map/usePlaces';
import {
  useCurrentLocation,
  type LocationResult,
} from '../Map/useCurrentLocation';
import { MapModal } from './MapModal';
import type { MapCommand } from '../Map/types';

vi.mock('../Map/usePlaces', () => ({ usePlaces: vi.fn() }));
vi.mock('../Map/useCurrentLocation', () => ({ useCurrentLocation: vi.fn() }));

// Leaflet needs a real layout engine; this stand-in records the markers and the last command.
const drawn: { markers: unknown[]; command: MapCommand | null }[] = [];
vi.mock('../Map', () => ({
  default: (props: { markers: unknown[]; command: MapCommand | null }) => {
    drawn.push({ markers: props.markers, command: props.command });
    return <div data-testid="map" />;
  },
}));

function place(name: string, titles: string[]) {
  return { name, lat: 50, lng: 7, titles };
}

function placesState(overrides: Partial<ReturnType<typeof usePlaces>> = {}) {
  vi.mocked(usePlaces).mockReturnValue({
    places: [],
    loading: false,
    error: false,
    ...overrides,
  });
}

function locationState(
  overrides: Partial<ReturnType<typeof useCurrentLocation>> = {},
) {
  vi.mocked(useCurrentLocation).mockReturnValue({
    location: null,
    locating: false,
    request: vi
      .fn()
      .mockResolvedValue({ ok: true, coords: { lat: 1, lng: 2 } }),
    ...overrides,
  });
}

function renderModal(props: Partial<Parameters<typeof MapModal>[0]> = {}) {
  return render(
    <I18nProvider>
      <ToastProvider>
        <MapModal
          categoryId="cat-1"
          search=""
          open
          onOpenChange={vi.fn()}
          {...props}
        />
      </ToastProvider>
    </I18nProvider>,
  );
}

describe('MapModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    drawn.length = 0;
    window.localStorage.setItem('lang', 'en');
    placesState();
    locationState();
  });

  it('reports that the map itself is broken rather than showing an empty one', () => {
    placesState({ error: true });
    renderModal();

    expect(screen.getByText(/Couldn't load map locations/i)).toBeVisible();
    expect(screen.queryByTestId('map')).not.toBeInTheDocument();
  });

  // "No places yet" would read as "never placed anything" when a search is what emptied the map.
  it('says the search emptied the map, not the collection', () => {
    renderModal({ search: 'zzz' });

    expect(screen.getByText('No locations match your search.')).toBeVisible();
  });

  it('says the collection has no places when nothing is being searched for', () => {
    renderModal({ search: '' });

    expect(screen.getByText('No locations to show yet.')).toBeVisible();
  });

  it('draws a pin per place, counting the entries only where there is more than one', async () => {
    placesState({
      places: [place('Bonn', ['a', 'b']), place('Köln', ['c'])],
    });
    renderModal();

    // Matched by count, not wording: which language the memo was built in depends on render order.
    await waitFor(() => expect(drawn.length).toBeGreaterThan(0));
    const markers = drawn.at(-1)?.markers as {
      popupText: string;
      countLabel?: string;
    }[];
    expect(markers.map((marker) => marker.popupText)).toEqual(['Bonn', 'Köln']);
    expect(markers[0]?.countLabel).toMatch(/^2 /);
    expect(markers[1]?.countLabel).toBeUndefined();
  });

  it('shows the map while places are still resolving, with a progress chip', async () => {
    placesState({ places: [place('Bonn', ['a'])], loading: true });
    renderModal();

    expect(await screen.findByTestId('map')).toBeVisible();
    expect(screen.getByRole('status')).toHaveAccessibleName('Loading…');
  });

  it('frames every pin once the places have settled', async () => {
    placesState({ places: [place('Bonn', ['a'])] });
    renderModal();

    await waitFor(() =>
      expect(drawn.at(-1)?.command).toMatchObject({ kind: 'fitAll' }),
    );
  });

  it('frames every pin again on request, as a new command', async () => {
    placesState({ places: [place('Bonn', ['a'])] });
    renderModal();
    await waitFor(() => expect(drawn.at(-1)?.command).not.toBeNull());
    const first = drawn.at(-1)?.command?.id;

    await userEvent.click(
      screen.getByRole('button', { name: 'Show all locations' }),
    );

    expect(drawn.at(-1)?.command?.id).toBe((first ?? 0) + 1);
  });

  it('frames the current location once the fix arrives', async () => {
    placesState({ places: [place('Bonn', ['a'])] });
    const request = vi
      .fn()
      .mockResolvedValue({ ok: true, coords: { lat: 1, lng: 2 } });
    locationState({ request, location: { lat: 1, lng: 2 } });
    renderModal();

    await userEvent.click(
      screen.getByRole('button', { name: 'Zoom to current location' }),
    );

    expect(request).toHaveBeenCalled();
    await waitFor(() =>
      expect(drawn.at(-1)?.command).toMatchObject({ kind: 'fitCurrent' }),
    );
    const marker = drawn.at(-1) as unknown as {
      markers: unknown[];
    };
    expect(marker).toBeDefined();
  });

  // The fix resolving after a later "show all" tap must not undo it.
  it('keeps the later tap when the location fix arrives after it', async () => {
    placesState({ places: [place('Bonn', ['a'])] });
    let resolveFix: (result: LocationResult) => void = () => {};
    const request = vi.fn(
      () => new Promise<LocationResult>((resolve) => (resolveFix = resolve)),
    );
    locationState({ request, location: { lat: 1, lng: 2 } });
    renderModal();
    await waitFor(() => expect(drawn.at(-1)?.command).not.toBeNull());

    await userEvent.click(
      screen.getByRole('button', { name: 'Zoom to current location' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Show all locations' }),
    );
    const afterShowAll = drawn.at(-1)?.command;
    await act(async () =>
      resolveFix({ ok: true, location: { lat: 1, lng: 2 } }),
    );

    expect(afterShowAll).toMatchObject({ kind: 'fitAll' });
    expect(drawn.at(-1)?.command).toEqual(afterShowAll);
  });

  it('explains a refused location rather than failing silently', async () => {
    placesState({ places: [place('Bonn', ['a'])] });
    locationState({
      request: vi.fn().mockResolvedValue({ ok: false, reason: 'denied' }),
    });
    renderModal();

    await userEvent.click(
      screen.getByRole('button', { name: 'Zoom to current location' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(/blocked/i);
  });

  it('explains a location that simply could not be found', async () => {
    placesState({ places: [place('Bonn', ['a'])] });
    locationState({
      request: vi.fn().mockResolvedValue({ ok: false, reason: 'unavailable' }),
    });
    renderModal();

    await userEvent.click(
      screen.getByRole('button', { name: 'Zoom to current location' }),
    );

    expect(await screen.findByRole('alert')).toBeVisible();
  });

  it('disables the location button while a fix is being taken', () => {
    placesState({ places: [place('Bonn', ['a'])] });
    locationState({ locating: true });
    renderModal();

    expect(
      screen.getByRole('button', { name: 'Zoom to current location' }),
    ).toBeDisabled();
  });
});
