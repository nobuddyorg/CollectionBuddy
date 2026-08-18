'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import { searchMinLength } from '../../data/items';
import CenteredModal from '../CenteredModal';
import Icon, { IconType } from '../Icon';
import { Spinner } from '../ui/Spinner';
import { usePlaces } from '../Map/usePlaces';
import { useCurrentLocation } from '../Map/useCurrentLocation';
import type { MapCommand, MapCommandKind } from '../Map/types';

const Map = dynamic(() => import('../Map'), { ssr: false });

export function MapModal({
  categoryId,
  search,
  open,
  onOpenChange,
}: {
  categoryId: string;
  search: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, lang } = useI18n();
  const toast = useToast();

  const {
    places,
    loading: loadingPlaces,
    error: placesError,
  } = usePlaces(categoryId, search, open, lang);

  // Starts empty; the map frames pins as they stream in on its own. This
  // state exists for the re-frame below, once the last place is geocoded.
  const [mapCommand, setMapCommand] = useState<MapCommand | null>(null);

  // Counter-based rather than withdrawn and reissued: clearing each command
  // after 0ms so repeats registered as a change made every command a
  // single-tick pulse a still-loading map could miss.
  const issueMapCommand = useCallback((kind: MapCommandKind) => {
    setMapCommand((prev) => ({ kind, id: (prev?.id ?? 0) + 1 }));
  }, []);

  const mapMarkers = useMemo(
    () =>
      places.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        popupText: p.name,
        titles: p.titles,
        // Only shown when count > 1: a lone entry is already described by
        // the place name line, and this avoids "1 entries" wording.
        countLabel:
          p.titles.length > 1
            ? t('item_list.map_entries_count').replace(
                '{count}',
                String(p.titles.length),
              )
            : undefined,
      })),
    [places, t],
  );

  // Re-frames once the last pin lands so the view covers the whole
  // collection, not just the quickest lookups. Also waits for a pin, not
  // just for loading to finish: `loadingPlaces` is still false on the
  // render that opens the map, so without this the map would first be told
  // to frame an empty collection.
  useEffect(() => {
    if (!open || loadingPlaces || places.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    issueMapCommand('fitAll');
  }, [open, loadingPlaces, places.length, issueMapCommand]);

  const {
    location: currentLocation,
    locating,
    request: requestLocation,
  } = useCurrentLocation(open);

  // Asks for the fix rather than reusing one: in an installed PWA, this
  // tap is the gesture the permission prompt hangs off, and the only place
  // a refusal can be explained.
  const showCurrentLocation = useCallback(async () => {
    const result = await requestLocation();
    if (!result.ok) {
      toast.error(
        t(
          result.reason === 'denied'
            ? 'item_list.location_denied'
            : 'item_list.location_unavailable',
        ),
      );
      return;
    }
    issueMapCommand('fitCurrent');
  }, [requestLocation, toast, t, issueMapCommand]);

  return (
    <CenteredModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('item_list.map_title')}
      closeLabel={t('common.close')}
      size="full"
    >
      {placesError ? (
        <p className="flex h-full items-center justify-center px-6 text-center text-sm opacity-70">
          {t('item_list.map_error')}
        </p>
      ) : !loadingPlaces && places.length === 0 ? (
        // A generic empty message would read as "you have no places" when
        // a search is what emptied the map, sending the reader to the
        // wrong place.
        <p className="flex h-full items-center justify-center px-6 text-center text-sm opacity-70">
          {t(
            search.length >= searchMinLength(search)
              ? 'item_list.map_empty_filtered'
              : 'item_list.map_empty',
          )}
        </p>
      ) : (
        // Mounts immediately rather than behind the geocoding spinner, so
        // Leaflet's chunk and first tiles load while places still resolve.
        <div className="relative h-full">
          {/* `relative` on this wrapper makes the overlay chips their own
              stacking context, so `z-[1000]` only has to clear Leaflet's
              own control layer (default z-index 1000), not the app's
              z-index scale. */}
          <Map
            command={mapCommand}
            markers={mapMarkers}
            currentLocation={
              currentLocation
                ? {
                    lat: currentLocation.lat,
                    lng: currentLocation.lng,
                    popupText: t('item_list.you_are_here'),
                  }
                : undefined
            }
          />
          {loadingPlaces && (
            // Fixed light colours and a solid plate: at 80% theme opacity
            // this was a pale chip on pale tiles in light mode, exactly
            // the "barely there" look the theme swap was meant to avoid.
            <div
              role="status"
              aria-label={t('common.loading')}
              className="absolute top-2 left-2 z-[1000] flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 shadow-md"
            >
              <Spinner size="sm" />
              {t('common.loading')}
            </div>
          )}
          {/* Fixed light colours, not theme tokens: the map tiles beneath
              never go dark, so a chip that did would be the only thing on
              the map switching with the rest of the app. */}
          <div className="absolute top-2 right-2 z-[1000] bg-white/80 backdrop-blur rounded-lg flex gap-1 p-1">
            <button
              type="button"
              onClick={() => void showCurrentLocation()}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-neutral-300 text-neutral-900 shadow-sm hover:opacity-90 disabled:opacity-50"
              aria-label={t('item_list.zoom_to_current_location')}
              title={t('item_list.zoom_to_current_location')}
              aria-busy={locating}
              disabled={locating}
            >
              <Icon icon={IconType.Gps} className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => issueMapCommand('fitAll')}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-white border border-neutral-300 text-neutral-900 shadow-sm hover:opacity-90"
              aria-label={t('item_list.frame_all_pins')}
              title={t('item_list.frame_all_pins')}
            >
              <Icon icon={IconType.Frame} className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </CenteredModal>
  );
}
