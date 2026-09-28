'use client';
import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../i18n/useI18n';
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
import EmptyState from '../EmptyState';
import LoadError from '../LoadError';
import { listViewFor } from './listView';
import type { ItemFormValues } from '../ItemForm';
import type { ImageEntry, ItemLite } from './types';
import { Toolbar } from './Toolbar';

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
    loadFailed,
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

  const [editingItem, setEditingItem] = useState<ItemLite | null>(null);
  // An index into the entry's images, not a URL: the carousel reaches photographs the strip never showed.
  const [modalState, setModalState] = useState<{
    itemId: string;
    index: number;
  } | null>(null);
  const modalImages = modalState ? images[modalState.itemId] : [];
  // Its last photograph deleted: closed for good, or an Undo or a new upload would pop the viewer back open.
  if (modalState && modalImages.length === 0) setModalState(null);
  const modalItemId = modalState?.itemId;
  const modalNeedsSigning = modalImages.some((image) => !image.urlFull);
  useEffect(() => {
    if (modalItemId && modalNeedsSigning) void signAllFor(modalItemId);
  }, [modalItemId, modalNeedsSigning, signAllFor]);
  const modalItemTitle = modalState
    ? (items.find((item) => item.id === modalState.itemId)?.title ?? '')
    : '';

  const closeEdit = () => setEditingItem(null);
  const handleEditSubmit = async (values: ItemFormValues) => {
    if (await saveEdit(editingItem!.id, values)) closeEdit();
  };

  const view = listViewFor({
    itemCount: items.length,
    total,
    loading,
    loadFailed,
  });
  // A viewer's New entry button is disabled, so their hint must not point at it.
  const noItemsHint = canEdit
    ? t('item_list.no_items_hint')
    : t('item_list.no_items_hint_read_only');

  let searchAnnouncement = '';
  if (!loading) {
    if (searchStatus.kind === 'active') {
      searchAnnouncement = tCount('item_list.results_count', {
        count: searchStatus.total,
      });
    } else if (searchStatus.kind === 'tooShort') {
      searchAnnouncement = t('item_list.search_too_short');
    }
  }

  return (
    <div className="space-y-4">
      <Toolbar
        query={query}
        onQueryChange={setQuery}
        canEdit={canEdit}
        onNewEntry={() => setCreateOpen(true)}
        onOpenMap={() => setMapOpen(true)}
      />

      {/* A too-short term earns no filter, so its count would pass off the whole category as results. */}
      <span data-testid="search-status" className="sr-only" aria-live="polite">
        {searchAnnouncement}
      </span>

      {view === 'skeleton' && <GridSkeleton />}

      {view === 'loadError' && (
        <LoadError
          testId="entries-load-error"
          title={t('item_list.load_error_title')}
          busy={loading}
          onRetry={() => void reload()}
        />
      )}

      {view === 'empty' && (
        <EmptyState
          symbol={debouncedQuery ? '🔍' : '🧺'}
          title={
            searchStatus.kind === 'active'
              ? t('item_list.no_results_title', { query: debouncedQuery })
              : t('item_list.no_items_title')
          }
          hint={
            searchStatus.kind === 'active'
              ? t('item_list.no_results_hint')
              : noItemsHint
          }
          titleTestId="empty-title"
        >
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
        </EmptyState>
      )}

      {view === 'grid' && (
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
              onEditItem={() => setEditingItem(item)}
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
        open={editingItem !== null}
        item={editingItem}
        isSaving={isSaving}
        onOpenChange={closeEdit}
        onSubmit={(values) => void handleEditSubmit(values)}
      />

      <MapModal
        categoryId={categoryId}
        search={debouncedQuery}
        canEdit={canEdit}
        open={mapOpen}
        onOpenChange={setMapOpen}
      />

      <CenteredModal
        open={isCreateOpen}
        onOpenChange={guardedCloseCreate}
        title={t('item_create.new_entry')}
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
