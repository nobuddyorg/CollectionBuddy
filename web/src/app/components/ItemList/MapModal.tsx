'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';

import { useI18n } from '../../i18n/useI18n';
import { useToast } from '../Toast/ToastProvider';
import { searchMinLength } from '../../data/items';
import CenteredModal from '../CenteredModal';
import Icon, { IconType } from '../Icon';
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

  // Starts empty. The map frames the pins it has as they stream in on its
  // own; this state exists for the re-frame below, once the last place has
  // been geocoded.
  const [mapCommand, setMapCommand] = useState<MapCommand | null>(null);

  // Issued and then left standing. Every command used to be withdrawn again
  // on a 0ms timeout, purely so that asking for the same one twice running
  // still counted as a change -- which made each one a pulse a single tick
  // wide. A map that had not finished loading Leaflet inside that tick never
  // saw it, and on the second open, with the library, the pins and the
  // geolocation fix all already in hand, that is the normal case. The
  // counter does the same job without the taking-back.
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
        // Only worth saying when there is more than one. A lone entry is
        // already fully described by the single line under the place name,
        // and "1 entries" is the wording this sidesteps rather than solves.
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

  // Pins stream in as each place is geocoded, and the map fits whatever it
  // has as soon as the first one lands. Re-frame once the last one is in so
  // the view covers the whole collection, not just the quickest lookups.
  //
  // Waits for a pin as well as for the loading to finish. `loadingPlaces` is
  // still false on the render that opens the map -- the fetch has not been
  // started yet, let alone flagged -- so without this the first thing the
  // map is told on every open is to frame an empty collection.
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

  // The button asks for the fix rather than merely re-using one: in an
  // installed PWA this tap is the gesture the permission prompt hangs off,
  // and it is the only place a refusal can be explained.
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
        // "Nothing here yet" is the wrong sentence when a search is what
        // emptied the map -- it reads as "you have entered no places",
        // which sends the reader looking for a bug in their collection
        // rather than at the search box they typed in.
        <p className="flex h-full items-center justify-center px-6 text-center text-sm opacity-70">
          {t(
            search.length >= searchMinLength(search)
              ? 'item_list.map_empty_filtered'
              : 'item_list.map_empty',
          )}
        </p>
      ) : (
        // The map mounts right away rather than behind the geocoding
        // spinner: Leaflet's chunk and the first tiles then load while the
        // places are still being resolved, instead of after.
        <div className="relative h-full">
          {/* The two overlay chips below sit above the map, not above
              anything the app's --z-index-* scale governs: `relative`
              on this wrapper makes it their own stacking context, so
              `z-[1000]` only has to clear Leaflet's own control layer
              (Leaflet's `.leaflet-top`/`.leaflet-control` default to
              z-index: 1000), not any of the app's named layers. */}
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
            <div className="absolute top-2 left-2 z-[1000] rounded-lg border bg-card/80 px-3 py-1.5 text-xs text-card-foreground shadow-sm backdrop-blur">
              {t('common.loading')}
            </div>
          )}
          {/* Fixed light colours rather than the theme tokens: the map
              tiles beneath never go dark, so a chip that did would be the
              one thing on top of the map switching hands with the rest of
              the app. */}
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
