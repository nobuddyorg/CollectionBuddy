'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import { useI18n } from '../../i18n/useI18n';
import ItemForm, { ItemFormValues } from '../ItemForm';
import CenteredModal from '../CenteredModal';
import { SearchInput } from './SearchInput';
import { Pagination } from './Pagination';
import { ItemCard } from './ItemCard';
import { ModalImage } from './ModalImage';
import { useItems } from './useItems';
import { useItemImages } from './useItemImages';
import type { ImgEntry } from './types';

export default function ItemList({ categoryId }: { categoryId: string }) {
  const { t } = useI18n();

  // search / pagination
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

  // images
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

  // edit modal
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
      <SearchInput value={q} onChange={setQ} />

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
    </div>
  );
}
