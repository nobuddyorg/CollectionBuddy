'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { deleteItem, updateItem } from '../../data/items';
import { useI18n } from '../../i18n/useI18n';
import ItemForm, { ItemFormValues } from '../ItemForm';
import CenteredModal from '../CenteredModal';
import { SearchInput } from './SearchInput';
import ItemCreate from '../ItemCreate';
import { Pagination } from './Pagination';
import { ItemCard } from './ItemCard';
import { ModalImage } from './ModalImage';
import { useItems } from './useItems';
import { useItemImages } from './useItemImages';
import type { ImgEntry } from './types';
import { usePlaces } from '../Map/usePlaces';

const Map = dynamic(() => import('../Map'), { ssr: false });
import Icon, { IconType } from '../Icon';
import { IconButton } from '../ui/IconButton';
import { useConfirm } from '../Confirm/ConfirmProvider';
import { useToast } from '../Toast/ToastProvider';

export default function ItemList({ categoryId }: { categoryId: string }) {
  const { t } = useI18n();
  const toast = useToast();
  const confirm = useConfirm();

  const [isCreateOpen, setCreateOpen] = useState(false);

  const [mapOpen, setMapOpen] = useState(false);
  const {
    places,
    loading: loadingPlaces,
    error: placesError,
  } = usePlaces(categoryId, mapOpen);
  const [mapCommand, setMapCommand] = useState<'fitAll' | 'fitCurrent' | null>(
    'fitAll',
  );

  const mapMarkers = useMemo(
    () =>
      places.map((p) => ({
        lat: p.lat,
        lng: p.lng,
        popupText: p.name,
      })),
    [places],
  );

  const [currentLocation, setCurrentLocation] = useState<null | {
    lat: number;
    lng: number;
  }>(null);

  useEffect(() => {
    if (!mapOpen) return;
    if (!navigator.geolocation) return;

    let stopped = false;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (stopped) return;
        setCurrentLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (stopped) return;
        setCurrentLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );

    const timer = window.setTimeout(() => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    }, 10000);

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    };
  }, [mapOpen]);

  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q.trim()), 200);
    return () => clearTimeout(id);
  }, [q]);

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
    refreshAllImages,
    uploadImage,
    deleteImage,
    deleteAllItemImages,
    busy,
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
    tags: string[];
  }) => {
    setEditing({
      id: it.id,
      values: {
        title: it.title,
        description: it.description ?? '',
        place: it.place ?? '',
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

  const removeItem = async (id: string) => {
    if (!(await confirm(t('item_list.confirm_delete')))) return;
    try {
      // Delete storage objects before the row: the DB trigger can only ever
      // remove the storage.objects metadata row, not the underlying bytes
      // in the storage backend, so this is the only path that actually
      // reclaims the space.
      await deleteAllItemImages(id);
    } catch (err) {
      console.error('Failed to delete item images:', err);
      toast.error(t('item_list.delete_images_error'));
      return;
    }
    const { error } = await deleteItem(id);
    if (error) {
      console.error('Failed to delete item:', error);
      toast.error(t('item_list.delete_error'));
      return;
    }
    await reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <IconButton
          onClick={() => setCreateOpen(true)}
          aria-label={t('item_create.new_entry')}
          title={t('item_create.new_entry')}
        >
          <Icon icon={IconType.Plus} className="w-4 h-4" />
        </IconButton>

        <button
          type="button"
          onClick={() => setMapOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-xl border-2 border-primary text-primary shadow-sm hover:bg-primary hover:text-primary-foreground transition-colors"
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

        <div className="flex-1 min-w-[6rem] sm:min-w-[12rem]">
          <SearchInput value={q} onChange={setQ} />
        </div>
      </div>

      <span className="sr-only" aria-live="polite">
        {!loading && qDebounced
          ? t('item_list.results_count').replace('{count}', String(total))
          : ''}
      </span>

      {items.length === 0 ? (
        loading ? (
          <p
            className="py-10 text-center text-sm text-foreground/70"
            aria-live="polite"
          >
            {t('common.loading')}
          </p>
        ) : (
          <section className="rounded-2xl border-2 border-dashed border-card-foreground/20 bg-card/40 p-10 grid place-items-center text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="relative h-16 w-16 rounded-full bg-card grid place-items-center text-3xl shadow-inner border-2 border-primary/50">
                <span
                  className="pin"
                  style={{ top: -8, left: 'calc(50% - 9px)' }}
                  aria-hidden="true"
                />
                {qDebounced ? '🔍' : '🧺'}
              </div>
              <div className="space-y-1">
                <h3 className="font-display text-lg text-foreground">
                  {qDebounced
                    ? t('item_list.no_results_title').replace('{q}', qDebounced)
                    : t('item_list.no_items_title')}
                </h3>
                <p className="text-sm text-foreground/70">
                  {qDebounced
                    ? t('item_list.no_results_hint')
                    : t('item_list.no_items_hint')}
                </p>
              </div>
              {qDebounced && (
                <button
                  type="button"
                  onClick={() => setQ('')}
                  className="text-sm underline text-primary hover:text-foreground"
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
          className={`grid sm:grid-cols-2 lg:grid-cols-3 gap-5 pt-2 transition-opacity ${loading ? 'opacity-60' : ''}`}
        >
          {items.map((it) => (
            <ItemCard
              key={it.id}
              item={it}
              imgs={images[it.id] ?? ([] as ImgEntry[])}
              busy={busy.has(it.id)}
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
            showIconSubmit
          />
        </section>
      </CenteredModal>

      <CenteredModal
        open={mapOpen}
        onOpenChange={setMapOpen}
        title={t('item_list.map_title')}
        closeLabel={t('common.close')}
      >
        {loadingPlaces ? (
          <p>{t('common.loading')}</p>
        ) : !mapOpen ? null : placesError ? (
          <p className="py-6 text-center text-sm opacity-70">
            {t('item_list.map_error')}
          </p>
        ) : places.length === 0 ? (
          <p className="py-6 text-center text-sm opacity-70">
            {t('item_list.map_empty')}
          </p>
        ) : (
          <div className="relative">
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
            <div className="absolute top-2 right-2 z-[1000] bg-card/80 backdrop-blur rounded-lg flex gap-1 p-1">
              <button
                type="button"
                onClick={() => {
                  if (!currentLocation) return;
                  setMapCommand('fitCurrent');
                  setTimeout(() => setMapCommand(null), 0);
                }}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-card border text-card-foreground shadow-sm hover:brightness-110 disabled:opacity-50"
                aria-label={t('item_list.zoom_to_current_location')}
                title={t('item_list.zoom_to_current_location')}
                disabled={!currentLocation}
              >
                <Icon icon={IconType.Gps} className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setMapCommand('fitAll');
                  setTimeout(() => setMapCommand(null), 0);
                }}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-card border text-card-foreground shadow-sm hover:brightness-110"
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
