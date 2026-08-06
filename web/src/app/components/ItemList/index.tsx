'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { deleteItem, updateItem, SEARCH_MIN_LENGTH } from '../../data/items';
import { useI18n } from '../../i18n/useI18n';
import ItemForm, { ItemFormValues } from '../ItemForm';
import CenteredModal from '../CenteredModal';
import { SearchInput } from './SearchInput';
import ItemCreate from '../ItemCreate';
import { Pagination } from './Pagination';
import { ItemCard } from './ItemCard';
import { ModalImage } from './ModalImage';
import { GridSkeleton } from './Skeleton';
import { useItems } from './useItems';
import { useItemImages } from './useItemImages';
import { restoreAt } from './optimistic';
import type { ImgEntry } from './types';
import { usePlaces } from '../Map/usePlaces';
import { useCurrentLocation } from '../Map/useCurrentLocation';
import type { MapCommand, MapCommandKind } from '../Map/types';

const Map = dynamic(() => import('../Map'), { ssr: false });

// Warms the chunk dynamic() above will ask for -- Leaflet is ~40 KB gzipped
// and, with the geocode cache primed, downloading it is what the map now
// waits on. Requesting the same specifier is deduped by the bundler, so the
// later mount resolves straight from the module cache. Hung off intent
// (hover, focus, the press that precedes the click) rather than page load,
// so nobody who leaves the map alone pays for it.
const prefetchMap = () => {
  // A failed prefetch is not worth reporting: dynamic() retries the same
  // import when the map actually opens, and surfaces the error there.
  void import('../Map').catch(() => {});
};
import Icon, { IconType } from '../Icon';
import { useConfirm } from '../Confirm/ConfirmProvider';
import { useToast } from '../Toast/ToastProvider';

export default function ItemList({ categoryId }: { categoryId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();

  const [isCreateOpen, setCreateOpen] = useState(false);

  // Declared up here, ahead of the map, because the map is filtered by the
  // same term the list is: they are one filtered set drawn two ways.
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q.trim()), 200);
    return () => clearTimeout(id);
  }, [q]);

  const [mapOpen, setMapOpen] = useState(false);
  const {
    places,
    loading: loadingPlaces,
    error: placesError,
  } = usePlaces(categoryId, qDebounced, mapOpen);
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
      })),
    [places],
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
    if (!mapOpen || loadingPlaces || places.length === 0) return;
    issueMapCommand('fitAll');
  }, [mapOpen, loadingPlaces, places.length, issueMapCommand]);

  const {
    location: currentLocation,
    locating,
    request: requestLocation,
  } = useCurrentLocation(mapOpen);

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

  const { items, total, loading, page, setPage, totalPages, reload, setItems } =
    useItems(categoryId, qDebounced);

  const handleCreated = useCallback(() => {
    setCreateOpen(false);
    // New items sort to page 1 (created_at desc). If we're already there,
    // reload() to reveal it; otherwise setPage(1) and let useItems' own
    // page-change effect fetch it -- reload() would just re-fetch the page
    // we're leaving.
    if (page !== 1) {
      setPage(1);
    } else {
      void reload();
    }
  }, [setCreateOpen, page, setPage, reload]);

  const {
    images,
    loadingItems,
    refreshAllImages,
    uploadImage,
    deleteImage,
    deleteAllItemImages,
    pendingUploads,
    deletingPath,
  } = useItemImages();

  const itemIdsKey = items.map((i) => i.id).join(',');
  useEffect(() => {
    if (!itemIdsKey) return;
    void refreshAllImages(itemIdsKey.split(','));
  }, [itemIdsKey, refreshAllImages]);

  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<null | {
    id: string;
    values: ItemFormValues;
  }>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [modalImage, setModalImage] = useState<string | null>(null);

  const openEdit = (it: {
    id: string;
    title: string;
    description: string | null;
    place: string | null;
    place_lat: number | null;
    place_lng: number | null;
    tags: string[];
  }) => {
    setEditing({
      id: it.id,
      values: {
        title: it.title,
        description: it.description ?? '',
        place: it.place ?? '',
        // Round-tripped rather than dropped: the form only replaces these
        // when the place field itself is edited, so an item edited for any
        // other reason keeps the pin it already had.
        place_lat: it.place_lat,
        place_lng: it.place_lng,
        tags: it.tags ?? [],
      },
    });
    setEditOpen(true);
  };

  const saveEdit = async (values: ItemFormValues) => {
    if (!editing || isSaving) return;
    setIsSaving(true);
    try {
      // The DB is the normalization authority (trims, collapses whitespace,
      // dedupes/sorts tags) -- send raw values and merge the row it returns,
      // rather than re-deriving a client-side copy that can diverge from it.
      const payload = {
        title: values.title,
        description: values.description,
        place: values.place,
        place_lat: values.place_lat,
        place_lng: values.place_lng,
        tags: values.tags,
      };
      const { data, error } = await updateItem(editing.id, payload);
      if (error || !data) {
        console.error('Failed to save item:', error);
        toast.error(t('item_list.save_error'));
        return;
      }
      setItems((prev) =>
        prev.map((it) => (it.id === editing.id ? { ...it, ...data } : it)),
      );
      setEditOpen(false);
      setEditing(null);
    } finally {
      setIsSaving(false);
    }
  };

  // The card goes the moment the deletion is confirmed, and the work runs
  // behind it. Deleting used to hold the card on screen through five
  // sequential round trips -- and clear its image state partway through, so
  // it sat there as a photoless shell before finally vanishing on a full
  // page refetch (#238). Nothing about that wait was informative: the
  // outcome is almost always success, and the one thing the user wants to
  // see is the card gone.
  //
  // Failure puts it back where it was rather than leaving a card the
  // database still has silently missing from the grid.
  const removeItem = async (id: string) => {
    if (!(await confirm(t('item_list.confirm_delete')))) return;

    // Captured before the optimistic removal, from the rendered list rather
    // than inside the state updater -- updaters can run more than once.
    const index = items.findIndex((it) => it.id === id);
    const snapshot = items[index];
    setItems((prev) => prev.filter((it) => it.id !== id));

    const restore = () => {
      if (!snapshot) return;
      setItems((prev) => restoreAt(prev, index, snapshot));
    };

    try {
      // Storage objects before the row, still: only the Storage API can
      // reclaim the actual bytes, and once the row is gone there is nothing
      // left to find them by.
      await deleteAllItemImages(id);
    } catch (err) {
      console.error('Failed to delete item images:', err);
      toast.error(t('item_list.delete_images_error'));
      restore();
      return;
    }
    const { error } = await deleteItem(id);
    if (error) {
      console.error('Failed to delete item:', error);
      toast.error(t('item_list.delete_error'));
      restore();
      return;
    }
    // Resyncs the page silently: pulls up whatever item now belongs in the
    // freed slot and corrects the total the pagination is drawn from.
    void reload({ silent: true });
  };

  return (
    <div className="space-y-4">
      {/* Mobile-first toolbar: search takes the full first row where it is
          actually usable, actions sit beside it from `sm` up. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchInput value={q} onChange={setQ} />
        </div>

        <div className="flex gap-2 sm:shrink-0">
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="flex-1 sm:flex-none min-h-11 px-4 flex items-center justify-center gap-2 rounded-sm bg-primary text-primary-foreground font-label text-xs hover:opacity-90 transition-opacity"
          >
            <Icon icon={IconType.Plus} className="w-4 h-4" aria-hidden="true" />
            {t('item_create.new_entry')}
          </button>

          <button
            type="button"
            onClick={() => setMapOpen(true)}
            onPointerEnter={prefetchMap}
            onPointerDown={prefetchMap}
            onFocus={prefetchMap}
            className="min-h-11 w-11 shrink-0 flex items-center justify-center rounded-sm ring-1 ring-inset ring-border text-foreground hover:bg-muted transition-colors"
            aria-label={t('item_list.open_map')}
            title={t('item_list.open_map')}
          >
            <Icon
              icon={IconType.Map}
              className="w-5 h-5"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
          </button>
        </div>
      </div>

      <span className="sr-only" aria-live="polite">
        {!loading && qDebounced
          ? t('item_list.results_count').replace('{count}', String(total))
          : ''}
      </span>

      {items.length === 0 ? (
        loading ? (
          <GridSkeleton />
        ) : (
          <section className="py-16 grid place-items-center text-center">
            <div className="flex flex-col items-center gap-4 max-w-xs">
              <div className="h-16 w-16 bg-card ring-1 ring-border grid place-items-center text-3xl">
                {qDebounced ? '🔍' : '🧺'}
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display text-lg text-foreground">
                  {qDebounced
                    ? t('item_list.no_results_title').replace('{q}', qDebounced)
                    : t('item_list.no_items_title')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {qDebounced
                    ? t('item_list.no_results_hint')
                    : t('item_list.no_items_hint')}
                </p>
              </div>
              {qDebounced && (
                <button
                  type="button"
                  onClick={() => setQ('')}
                  className="min-h-11 px-3 font-label text-xs text-foreground underline underline-offset-4"
                >
                  {t('item_list.search_clear')}
                </button>
              )}
            </div>
          </section>
        )
      ) : (
        <ul
          aria-busy={loading}
          aria-labelledby="entries-heading"
          // Cards are detached objects on mobile too, not a full-bleed
          // stack: they keep the page's own side margin, so paper shows on
          // all four edges of every card. Edge-to-edge cards had no left or
          // right boundary at all, which left a thin horizontal band as the
          // single cue separating one entry from the next -- not enough to
          // bind a caption and its buttons to the photograph above them.
          className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}
        >
          {items.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              imgs={images[it.id] ?? ([] as ImgEntry[])}
              pendingUploads={pendingUploads[it.id] ?? 0}
              imagesLoading={loadingItems.has(it.id)}
              deletingPath={deletingPath}
              onUpload={(f) => uploadImage(it.id, f)}
              onEditItem={() => openEdit(it)}
              onDeleteItem={() => void removeItem(it.id)}
              onDeleteImage={(img) => void deleteImage(it.id, img)}
              onOpenModal={setModalImage}
            />
          ))}
        </ul>
      )}

      <Pagination page={page} setPage={setPage} totalPages={totalPages} />

      <ModalImage url={modalImage} onClose={() => setModalImage(null)} />

      <CenteredModal
        open={editOpen}
        onOpenChange={(v) => {
          setEditOpen(v);
          if (!v) setEditing(null);
        }}
        title={t('item_list.edit_item')}
        closeLabel={t('common.close')}
      >
        <section className="relative z-[50]">
          <ItemForm
            key={editing?.id}
            initial={
              editing?.values ?? {
                title: '',
                description: '',
                place: '',
                place_lat: null,
                place_lng: null,
                tags: [],
              }
            }
            submitLabel={t('common.save')}
            submitting={isSaving}
            onSubmit={saveEdit}
            onCancel={() => {
              setEditOpen(false);
              setEditing(null);
            }}
          />
        </section>
      </CenteredModal>

      <CenteredModal
        open={mapOpen}
        onOpenChange={setMapOpen}
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
              qDebounced.length >= SEARCH_MIN_LENGTH
                ? 'item_list.map_empty_filtered'
                : 'item_list.map_empty',
            )}
          </p>
        ) : (
          // The map mounts right away rather than behind the geocoding
          // spinner: Leaflet's chunk and the first tiles then load while the
          // places are still being resolved, instead of after.
          <div className="relative h-full">
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
            <div className="absolute top-2 right-2 z-[1000] bg-card/80 backdrop-blur rounded-lg flex gap-1 p-1">
              <button
                type="button"
                onClick={() => void showCurrentLocation()}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-card border text-card-foreground shadow-sm hover:opacity-90 disabled:opacity-50"
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
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-card border text-card-foreground shadow-sm hover:opacity-90"
                aria-label={t('item_list.frame_all_pins')}
                title={t('item_list.frame_all_pins')}
              >
                <Icon icon={IconType.Frame} className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </CenteredModal>

      <CenteredModal
        open={isCreateOpen}
        onOpenChange={setCreateOpen}
        title={t('item_create.new_entry')}
        closeLabel={t('common.close')}
      >
        <ItemCreate categoryId={categoryId} onCreated={handleCreated} />
      </CenteredModal>
    </div>
  );
}
