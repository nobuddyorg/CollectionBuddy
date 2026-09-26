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
import { pageImageRowsFor } from './imageEntries';
import { useItemMutations } from './useItemMutations';
import { searchStatusFor } from './searchStatus';
import { useDebouncedValue } from '../../lib/useDebouncedValue';
import { useSyncedRef } from '../../lib/useSyncedRef';
import { useGuardedModalClose } from '../../lib/useGuardedModalClose';
import { EditItemModal } from './EditItemModal';
import { MapModal } from './MapModal';
import CenteredModal from '../CenteredModal';
import Icon, { IconType } from '../Icon';
import type { ItemFormValues } from '../ItemForm';
import type { ImageEntry, ItemLite } from './types';

// Warmed on intent, not page load; a failed prefetch is retried by dynamic() on the actual open.
const prefetchMap = () => {
  void import('../Map').catch(() => {});
};

const prefetchItemForm = () => {
  void import('../ItemForm').catch(() => {});
};

// Stable identity: a fresh [] per render would defeat ItemCard's reference-equality memo.
const EMPTY_IMAGES: ImageEntry[] = [];

export default function ItemList({
  categoryId,
  canEdit,
}: {
  categoryId: string;
  /** Viewer-role share: write controls hide (UX only; RLS authorizes), "New entry" stays disabled. */
  canEdit: boolean;
}) {
  const { t, tCount } = useI18n();

  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isCreateDirty, setCreateDirty] = useState(false);

  const closeCreate = useCallback(() => setCreateOpen(false), []);
  const discardCreate = useCallback(() => setCreateDirty(false), []);
  const guardedCloseCreate = useGuardedModalClose({
    isDirty: isCreateDirty,
    onClose: closeCreate,
    onDiscard: discardCreate,
  });

  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 200).trim();

  const [mapOpen, setMapOpen] = useState(false);

  const {
    items,
    pageImages,
    total,
    loading,
    page,
    setPage,
    totalPages,
    reload,
    setItems,
  } = useItems(categoryId, debouncedQuery);
  const searchStatus = searchStatusFor(debouncedQuery, total);

  const handleCreated = useCallback(() => {
    setCreateOpen(false);
    // New entries sort to page 1: setPage(1) fetches on its own; already there, only a reload does.
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
    showImages,
    signAllFor,
    uploadImage,
    deleteImage,
    captureItemImagePaths,
    forgetItemImages,
    pendingUploads,
  } = useItemImages();

  // Read through a ref so a reload that keeps the same items re-signs nothing.
  const pageImagesRef = useSyncedRef(pageImages);
  const itemIdsKey = items.map((item) => item.id).join(',');
  useEffect(() => {
    if (!itemIdsKey) return;
    const itemIds = itemIdsKey.split(',');
    const carried = pageImageRowsFor(pageImagesRef.current, itemIdsKey);
    if (carried) void showImages(itemIds, carried);
    else void refreshAllImages(itemIds);
  }, [itemIdsKey, pageImagesRef, refreshAllImages, showImages]);

  const { saveEdit, isSaving, removeItem } = useItemMutations({
    items,
    setItems,
    reload,
    captureItemImagePaths,
    forgetItemImages,
  });

  const [editOpen, setEditOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemLite | null>(null);
  // An index into the entry's images, not a URL: the carousel reaches photographs the strip never showed.
  const [modalState, setModalState] = useState<{
    itemId: string;
    index: number;
  } | null>(null);
  const modalImages = modalState ? images[modalState.itemId] : [];
  const modalItemId = modalState?.itemId;
  const modalNeedsSigning = modalImages.some((image) => !image.urlFull);
  useEffect(() => {
    if (modalItemId && modalNeedsSigning) void signAllFor(modalItemId);
  }, [modalItemId, modalNeedsSigning, signAllFor]);
  const modalItemTitle = modalState
    ? (items.find((item) => item.id === modalState.itemId)?.title ?? '')
    : '';

  const openEdit = (item: ItemLite) => {
    setEditingItem(item);
    setEditOpen(true);
  };

  const handleEditSubmit = useCallback(
    async (values: ItemFormValues) => {
      const ok = await saveEdit(editingItem!.id, values);
      if (ok) {
        setEditOpen(false);
        setEditingItem(null);
      }
    },
    [editingItem, saveEdit, setEditOpen, setEditingItem],
  );

  // Empty `items` with `total > 0` is a page correction in flight, not an empty collection.
  const isEmpty = items.length === 0;
  const showSkeleton = isEmpty && (loading || total > 0);
  const showEmptyState = isEmpty && !showSkeleton;

  let searchAnnouncement = '';
  if (!loading) {
    if (searchStatus.kind === 'active') {
      searchAnnouncement = tCount(
        'item_list.results_count',
        searchStatus.total,
      );
    } else if (searchStatus.kind === 'tooShort') {
      searchAnnouncement = t('item_list.search_too_short');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1">
          <SearchInput value={query} onChange={setQuery} />
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

      {/* A too-short term earns no filter, so its count would pass off the whole category as results. */}
      <span data-testid="search-status" className="sr-only" aria-live="polite">
        {searchAnnouncement}
      </span>

      {showSkeleton && <GridSkeleton />}

      {showEmptyState && (
        <section className="py-16 grid place-items-center text-center">
          <div className="flex flex-col items-center gap-4 max-w-xs">
            <div className="h-16 w-16 bg-card ring-1 ring-border grid place-items-center text-3xl">
              {debouncedQuery ? '🔍' : '🧺'}
            </div>
            <div className="space-y-1.5">
              <h3
                data-testid="empty-title"
                className="font-display text-lg text-foreground"
              >
                {searchStatus.kind === 'active'
                  ? t('item_list.no_results_title').replace(
                      '{q}',
                      debouncedQuery,
                    )
                  : t('item_list.no_items_title')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {searchStatus.kind === 'active'
                  ? t('item_list.no_results_hint')
                  : t('item_list.no_items_hint')}
              </p>
            </div>
            {debouncedQuery && (
              <button
                type="button"
                data-testid="empty-clear-search"
                onClick={() => setQuery('')}
                className="min-h-11 px-3 font-label text-xs text-foreground underline underline-offset-4"
              >
                {t('item_list.search_clear')}
              </button>
            )}
          </div>
        </section>
      )}

      {!isEmpty && (
        <ul
          aria-busy={loading}
          aria-labelledby="entries-heading"
          className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}
        >
          {items.map((item, index) => (
            <ItemCard
              key={item.id}
              item={item}
              images={images[item.id] ?? EMPTY_IMAGES}
              pendingUploads={pendingUploads[item.id] ?? 0}
              imagesLoading={loadingItems.has(item.id)}
              onUpload={(file) => void uploadImage(item.id, file)}
              onEditItem={() => openEdit(item)}
              onDeleteItem={() => void removeItem(item.id)}
              onDeleteImage={(image) => void deleteImage(item.id, image)}
              onOpenModal={(imageIndex) =>
                setModalState({ itemId: item.id, index: imageIndex })
              }
              // The grid is at most 3 wide, so the LCP candidate is always among the first three.
              priority={index < 3}
              readOnly={!canEdit}
            />
          ))}
        </ul>
      )}

      <Pagination page={page} setPage={setPage} totalPages={totalPages} />

      <ModalImage
        images={modalImages}
        index={modalState ? modalState.index : null}
        itemTitle={modalItemTitle}
        onIndexChange={(index) =>
          setModalState((previous) => ({ ...previous!, index }))
        }
        onClose={() => setModalState(null)}
        onDelete={(image) => void deleteImage(modalState!.itemId, image)}
        busy={modalState ? (pendingUploads[modalState.itemId] ?? 0) > 0 : false}
        readOnly={!canEdit}
      />

      <EditItemModal
        open={editOpen}
        item={editingItem}
        isSaving={isSaving}
        onOpenChange={() => {
          setEditOpen(false);
          setEditingItem(null);
        }}
        onSubmit={(values) => void handleEditSubmit(values)}
      />

      <MapModal
        categoryId={categoryId}
        search={debouncedQuery}
        open={mapOpen}
        onOpenChange={setMapOpen}
      />

      <CenteredModal
        open={isCreateOpen}
        onOpenChange={guardedCloseCreate}
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
