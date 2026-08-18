'use client';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../i18n/useI18n';
import { SearchInput } from './SearchInput';
import ItemCreate from '../ItemCreate';
import { Pagination } from './Pagination';
import { ItemCard } from './ItemCard';
import { ModalImage } from './ModalImage';
import { GridSkeleton } from './Skeleton';
import { useItems } from './useItems';
import { useItemImages } from './useItemImages';
import { useItemMutations } from './useItemMutations';
import { searchStatusFor } from './searchStatus';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { useGuardedModalClose } from '../../lib/useGuardedModalClose';
import { EditItemModal } from './EditItemModal';
import { MapModal } from './MapModal';
import CenteredModal from '../CenteredModal';
import type { ItemFormValues } from '../ItemForm';
import type { ImgEntry, ItemLite } from './types';

// Warms the map modal's dynamic() chunk on intent (hover/focus/press-down)
// rather than page load, so leaving the map alone costs nothing.
const prefetchMap = () => {
  // A failed prefetch isn't reported: dynamic() retries on actual open.
  void import('../Map').catch(() => {});
};

// Same reasoning, for the create form's dynamic() import.
const prefetchItemForm = () => {
  void import('../ItemForm').catch(() => {});
};
import Icon, { IconType } from '../Icon';

// Stable identity for entries with no photographs yet, so an unrelated
// re-render doesn't hand ItemCard a fresh `[]` and force it to re-render too
// (it's memoized against reference equality here).
const EMPTY_IMAGES: ImgEntry[] = [];

export default function ItemList({
  categoryId,
  canEdit,
}: {
  categoryId: string;
  /** False for a category shared read-only (viewer role). Every write
   * control but "New entry" is hidden, not just disabled -- RLS already
   * refuses the writes, so this is UX, not the security boundary. "New
   * entry" stays mounted and disabled so the toolbar doesn't shrink to
   * just the Map button. */
  canEdit: boolean;
}) {
  const { t, tCount } = useI18n();

  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isCreateDirty, setCreateDirty] = useState(false);

  const closeCreate = useCallback(() => setCreateOpen(false), []);
  const discardCreate = useCallback(() => setCreateDirty(false), []);
  const guardedCloseCreate = useGuardedModalClose(
    isCreateDirty,
    closeCreate,
    discardCreate,
  );

  // Declared up here, ahead of the map, because the map is filtered by the
  // same term the list is: they are one filtered set drawn two ways.
  const [q, setQ] = useState('');
  const qDebounced = useDebouncedValue(q, 200).trim();

  const [mapOpen, setMapOpen] = useState(false);

  const { items, total, loading, page, setPage, totalPages, reload, setItems } =
    useItems(categoryId, qDebounced);
  const searchStatus = searchStatusFor(qDebounced, total);

  const handleCreated = useCallback(() => {
    setCreateOpen(false);
    // New items sort to page 1. If we're already there, reload() to reveal
    // it; otherwise setPage(1) and let useItems' own effect fetch it.
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
    captureItemImagePaths,
    removeImageBytes,
    pendingUploads,
    deletingPath,
  } = useItemImages();

  const itemIdsKey = items.map((i) => i.id).join(',');
  useEffect(() => {
    if (!itemIdsKey) return;
    void refreshAllImages(itemIdsKey.split(','));
  }, [itemIdsKey, refreshAllImages]);

  const { saveEdit, isSaving, removeItem } = useItemMutations({
    items,
    setItems,
    reload,
    captureItemImagePaths,
    removeImageBytes,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemLite | null>(null);
  // Which entry's carousel is open, and where in its `imgs` it's showing --
  // not a URL, so the modal can navigate to every photograph an entry has,
  // including ones a strip cell never had room for (#304).
  const [modalState, setModalState] = useState<{
    itemId: string;
    index: number;
  } | null>(null);
  const modalImgs = modalState ? (images[modalState.itemId] ?? []) : [];
  const modalItemTitle = modalState
    ? (items.find((i) => i.id === modalState.itemId)?.title ?? '')
    : '';

  const openEdit = (item: ItemLite) => {
    setEditingItem(item);
    setEditOpen(true);
  };

  const handleEditSubmit = useCallback(
    async (values: ItemFormValues) => {
      if (!editingItem) return;
      const ok = await saveEdit(editingItem.id, values);
      if (ok) {
        setEditOpen(false);
        setEditingItem(null);
      }
    },
    [editingItem, saveEdit, setEditOpen, setEditingItem],
  );

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
            data-testid="new-entry"
            onClick={() => setCreateOpen(true)}
            onPointerEnter={canEdit ? prefetchItemForm : undefined}
            onPointerDown={canEdit ? prefetchItemForm : undefined}
            onFocus={canEdit ? prefetchItemForm : undefined}
            disabled={!canEdit}
            title={
              canEdit ? undefined : t('item_create.new_entry_disabled_shared')
            }
            className="flex-1 sm:flex-none min-h-11 px-4 flex items-center justify-center gap-2 rounded-sm bg-primary text-primary-foreground font-label text-xs hover:opacity-90 disabled:opacity-40 disabled:hover:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            <Icon icon={IconType.Plus} className="w-4 h-4" aria-hidden="true" />
            {t('item_create.new_entry')}
          </button>

          <button
            type="button"
            data-testid="open-map"
            onClick={() => setMapOpen(true)}
            onPointerEnter={prefetchMap}
            onPointerDown={prefetchMap}
            onFocus={prefetchMap}
            className="min-h-11 w-11 shrink-0 flex items-center justify-center rounded-sm ring-1 ring-inset ring-control-border text-foreground hover:bg-muted transition-colors"
            aria-label={t('item_list.open_map')}
            title={t('item_list.open_map')}
          >
            <Icon icon={IconType.Map} className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* searchStatus, not raw qDebounced: a too-short term earns no filter
          from listItems, so announcing a count here would pass off the
          unfiltered total as a search result. */}
      <span className="sr-only" aria-live="polite">
        {loading
          ? ''
          : searchStatus.kind === 'active'
            ? tCount('item_list.results_count', searchStatus.total)
            : searchStatus.kind === 'tooShort'
              ? t('item_list.search_too_short')
              : ''}
      </span>

      {items.length === 0 ? (
        // `total > 0` with empty `items` isn't "no entries" -- it's the gap
        // between a page-no-longer-existing refetch landing and the
        // corrected page's fetch resolving. Painting the empty state here
        // would flash it over entries that still exist.
        loading || total > 0 ? (
          <GridSkeleton />
        ) : (
          <section className="py-16 grid place-items-center text-center">
            <div className="flex flex-col items-center gap-4 max-w-xs">
              <div className="h-16 w-16 bg-card ring-1 ring-border grid place-items-center text-3xl">
                {qDebounced ? '🔍' : '🧺'}
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display text-lg text-foreground">
                  {searchStatus.kind === 'active'
                    ? t('item_list.no_results_title').replace('{q}', qDebounced)
                    : t('item_list.no_items_title')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {searchStatus.kind === 'active'
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
          // Cards keep the page's side margin even on mobile, not full-bleed
          // -- edge-to-edge cards left only a thin band separating entries,
          // not enough to visually bind a caption to its photograph.
          className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}
        >
          {items.map((item, idx) => (
            <ItemCard
              key={item.id}
              item={item}
              imgs={images[item.id] ?? EMPTY_IMAGES}
              pendingUploads={pendingUploads[item.id] ?? 0}
              imagesLoading={loadingItems.has(item.id)}
              deletingPath={deletingPath}
              onUpload={(f) => void uploadImage(item.id, f)}
              onEditItem={() => openEdit(item)}
              onDeleteItem={() => void removeItem(item.id)}
              onDeleteImage={(img) => void deleteImage(item.id, img)}
              onOpenModal={(index) => setModalState({ itemId: item.id, index })}
              // The grid is up to 3 columns wide, so the LCP candidate is
              // always among the first three regardless of viewport.
              priority={idx < 3}
              readOnly={!canEdit}
            />
          ))}
        </ul>
      )}

      <Pagination page={page} setPage={setPage} totalPages={totalPages} />

      <ModalImage
        imgs={modalImgs}
        index={modalState ? modalState.index : null}
        itemTitle={modalItemTitle}
        onIndexChange={(index) =>
          setModalState((prev) => (prev ? { ...prev, index } : prev))
        }
        onClose={() => setModalState(null)}
        onDelete={(img) => {
          if (modalState) void deleteImage(modalState.itemId, img);
        }}
        deletingPath={deletingPath}
        busy={modalState ? (pendingUploads[modalState.itemId] ?? 0) > 0 : false}
        readOnly={!canEdit}
      />

      <EditItemModal
        open={editOpen}
        item={editingItem}
        isSaving={isSaving}
        onOpenChange={(v) => {
          setEditOpen(v);
          if (!v) setEditingItem(null);
        }}
        onSubmit={(values) => void handleEditSubmit(values)}
      />

      <MapModal
        categoryId={categoryId}
        search={qDebounced}
        open={mapOpen}
        onOpenChange={setMapOpen}
      />

      <CenteredModal
        open={isCreateOpen}
        onOpenChange={(v) => (v ? undefined : guardedCloseCreate())}
        title={t('item_create.new_entry')}
        closeLabel={t('common.close')}
      >
        <ItemCreate
          categoryId={categoryId}
          onCreated={handleCreated}
          onDirtyChange={setCreateDirty}
        />
      </CenteredModal>
    </div>
  );
}
