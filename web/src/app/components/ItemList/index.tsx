'use client';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import { useI18n } from '../../i18n/useI18n';
import ItemForm, { ItemFormValues } from '../ItemForm';
import CenteredModal from '../CenteredModal';
import { SearchInput } from './SearchInput';
import ItemCreate from '../ItemCreate';
import { usePref } from '../../usePref';
import { Pagination } from './Pagination';
import { ItemCard } from './ItemCard';
import { ModalImage } from './ModalImage';
import { useItems } from './useItems';
import { useItemImages } from './useItemImages';
import type { ImgEntry } from './types';
import Map from '../Map';
import { usePlaces } from '../Map/usePlaces';
import Icon, { IconType } from '../Icon';

export default function ItemList({ categoryId }: { categoryId: string }) {
  const { t } = useI18n();

  const prefKey = `cb_open_${categoryId}`;
  const [isCreateOpen, setCreateOpen] = usePref(prefKey, false);

  const [mapOpen, setMapOpen] = useState(false);
  const { places, loading: loadingPlaces } = usePlaces(categoryId);
  const [mapCommand, setMapCommand] = useState<'fitAll' | 'fitCurrent' | null>(
    'fitAll',
  );

  const [currentLocation, setCurrentLocation] = useState<null | {
    lat: number;
    lng: number;
  }>(null);

  useEffect(() => {
    if (!mapOpen) return;
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCurrentLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      () => {
        // silently ignore; user denied or unavailable
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 },
    );
  }, [mapOpen]);

  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q.trim()), 200);
    return () => clearTimeout(id);
  }, [q]);

  const { items, page, setPage, totalPages, reload, setItems } = useItems(
    categoryId,
    qDebounced,
  );

  const handleCreated = useCallback(() => {
    setCreateOpen(false);
    void reload();
  }, [setCreateOpen, reload]);

  const {
    images,
    refreshAllImages,
    uploadImage,
    deleteImage,
    busy,
    deletingPath,
  } = useItemImages();

  useEffect(() => {
    if (!items.length) return;
    void refreshAllImages(items.map((i) => i.id));
  }, [items, refreshAllImages]);

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
      const payload = {
        title: values.title.trim(),
        description: values.description.trim() || null,
        place: values.place.trim() || null,
        tags: values.tags,
      };
      const { error } = await supabase
        .from('items')
        .update(payload)
        .eq('id', editing.id);
      if (error) {
        alert(error.message);
        return;
      }
      setItems((prev) =>
        prev.map((it) => (it.id === editing.id ? { ...it, ...payload } : it)),
      );
      setEditOpen(false);
      setEditing(null);
    } finally {
      setIsSaving(false);
    }
  };

  const removeItem = async (id: string) => {
    if (!confirm(t('item_list.confirm_delete'))) return;
    await supabase.from('items').delete().eq('id', id);
    await reload();
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm hover:brightness-110"
          aria-label={t('item_create.new_entry')}
          title={t('item_create.new_entry')}
        >
          <Icon icon={IconType.Plus} className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={() => setMapOpen(true)}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-primary/10 text-primary/80 shadow-sm hover:brightness-110"
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

      <ul className="grid sm:grid-cols-2 lg:grid-cols-2 gap-3">
        {items.map((it) => (
          <ItemCard
            key={it.id}
            item={it}
            imgs={images[it.id] ?? ([] as ImgEntry[])}
            busy={busy === it.id}
            deletingPath={deletingPath}
            onUpload={(f) => uploadImage(it.id, f)}
            onEditItem={() => openEdit(it)}
            onDeleteItem={() => void removeItem(it.id)}
            onDeleteImage={(img) => void deleteImage(it.id, img)}
            onOpenModal={setModalImage}
            i18n={{ t }}
          />
        ))}
      </ul>

      <Pagination page={page} setPage={setPage} totalPages={totalPages} />

      <ModalImage url={modalImage} onClose={() => setModalImage(null)} />

      <CenteredModal
        open={editOpen}
        onOpenChange={(v) => {
          setEditOpen(v);
          if (!v) setEditing(null);
        }}
        title={t('item_list.edit_item')}
        closeLabel="X"
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
        closeLabel="X"
      >
        {loadingPlaces ? (
          <p>{t('common.loading')}</p>
        ) : (
          <div className="relative">
            <Map
              command={mapCommand}
              markers={places.map((p) => ({
                lat: p.lat,
                lng: p.lng,
                popupText: p.name,
              }))}
              currentLocation={
                currentLocation
                  ? {
                      lat: currentLocation.lat,
                      lng: currentLocation.lng,
                      popupText: t('item_list.you_are_here') ?? 'You are here',
                    }
                  : undefined
              }
            />
            <div className="absolute top-2 right-2 z-[1000] bg-white/50 backdrop-blur rounded-lg flex gap-1 p-1">
              <button
                type="button"
                onClick={() => setMapCommand('fitCurrent')}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary/10 text-primary/80 shadow-sm hover:brightness-110 disabled:opacity-50"
                aria-label="Zoom to current location"
                title="Zoom to current location"
                disabled={!currentLocation}
              >
                <Icon icon={IconType.Gps} className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => setMapCommand('fitAll')}
                className="w-9 h-9 flex items-center justify-center rounded-lg bg-primary/10 text-primary/80 shadow-sm hover:brightness-110"
                aria-label="Frame all pins"
                title="Frame all pins"
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
        closeLabel="X"
      >
        <ItemCreate categoryId={categoryId} onCreated={handleCreated} />
      </CenteredModal>
    </div>
  );
}
