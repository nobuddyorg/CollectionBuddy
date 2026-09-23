'use client';

import { useCallback, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';

import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import { searchMinLength } from '../../data/items';
import CenteredModal from '../CenteredModal';
import Icon, { IconType } from '../Icon';
import { Spinner } from '../ui/Spinner';
import { usePlaces } from '../Map/usePlaces';
import { useCurrentLocation } from '../Map/useCurrentLocation';
import { useMapFraming } from '../Map/useMapFraming';

const MapView = dynamic(() => import('../Map'), { ssr: false });

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

  // Starts empty; the map frames pins as they stream in on its own.
  const {
    command: mapCommand,
    tap,
    frameAllAutomatically,
  } = useMapFraming(open);

  const mapMarkers = useMemo(
    () =>
      places.map((place) => ({
        lat: place.lat,
        lng: place.lng,
        popupText: place.name,
        titles: place.titles,
        // Only when count > 1: a lone entry is already named by the place line, and "1 entries" is avoided.
        countLabel:
          place.titles.length > 1
            ? t('item_list.map_entries_count').replace(
                '{count}',
                String(place.titles.length),
              )
            : undefined,
      })),
    [places, t],
  );

  // Waits for a pin, not just for loading: `loadingPlaces` is still false on the render that opens the map.
  useEffect(() => {
    if (!open || loadingPlaces || places.length === 0) return;
    frameAllAutomatically();
  }, [open, loadingPlaces, places.length, frameAllAutomatically]);

  const {
    location: currentLocation,
    locating,
    request: requestLocation,
  } = useCurrentLocation(open);

  // Asks for a fresh fix: in an installed PWA this tap is the gesture the permission prompt hangs off.
  const showCurrentLocation = useCallback(async () => {
    const frame = tap('fitCurrent');
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
    frame();
  }, [requestLocation, toast, t, tap]);

  return (
    <CenteredModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('item_list.map_title')}
      closeLabel={t('common.close')}
      size="full"
    >
      {placesError && (
        <p className="flex h-full items-center justify-center px-6 text-center text-sm opacity-70">
          {t('item_list.map_error')}
        </p>
      )}

      {!placesError && !loadingPlaces && places.length === 0 && (
        // A generic empty message would read as "no places" when a search is what emptied the map.
        <p
          data-testid="map-empty"
          className="flex h-full items-center justify-center px-6 text-center text-sm opacity-70"
        >
          {t(
            search.length >= searchMinLength(search)
              ? 'item_list.map_empty_filtered'
              : 'item_list.map_empty',
          )}
        </p>
      )}

      {!placesError && (loadingPlaces || places.length > 0) && (
        // Mounted before the places resolve, so Leaflet's chunk and first tiles load meanwhile.
        <div className="relative h-full">
          {/* `relative` here: `z-[1000]` then only has to clear Leaflet's own control layer. */}
          <MapView
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
            // Fixed light colours and a solid plate: at 80% theme opacity this vanished on pale tiles.
            <div
              role="status"
              aria-label={t('common.loading')}
              className="absolute top-2 left-2 z-[1000] flex items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-900 shadow-md"
            >
              <Spinner size="sm" />
              {t('common.loading')}
            </div>
          )}
          {/* Fixed light colours, not theme tokens: the map tiles beneath never go dark. */}
          <div className="absolute top-2 right-2 z-[1000] bg-white/80 backdrop-blur rounded-lg flex gap-1 p-1">
            <button
              type="button"
              data-testid="zoom-to-location"
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
              data-testid="frame-all-pins"
              onClick={() => tap('fitAll')()}
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
