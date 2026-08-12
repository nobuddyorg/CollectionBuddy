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
import { EditItemModal } from './EditItemModal';
import { MapModal } from './MapModal';
import CenteredModal from '../CenteredModal';
import { useConfirm } from '../Confirm/ConfirmProvider';
import type { ItemFormValues } from '../ItemForm';
import type { ImgEntry, ItemLite } from './types';

// Warms the chunk the map modal's own dynamic() import will ask for --
// Leaflet is ~40 KB gzipped and, with the geocode cache primed, downloading
// it is what the map now waits on. Requesting the same specifier is deduped
// by the bundler, so the later mount resolves straight from the module
// cache. Hung off intent (hover, focus, the press that precedes the click)
// rather than page load, so nobody who leaves the map alone pays for it.
const prefetchMap = () => {
  // A failed prefetch is not worth reporting: dynamic() retries the same
  // import when the map actually opens, and surfaces the error there.
  void import('../Map').catch(() => {});
};
import Icon, { IconType } from '../Icon';

// A stable identity for entries with no photographs yet, so a card that
// hasn't been given one doesn't get a fresh `[]` -- and therefore a forced
// re-render -- every time this component runs for an unrelated reason
// (ItemCard is memoized against exactly this; see ItemCard.tsx).
const EMPTY_IMAGES: ImgEntry[] = [];

export default function ItemList({
  categoryId,
  ownerUserId,
  isShared,
}: {
  categoryId: string;
  /** Owner of the currently open category -- for an owned category, this is
   * the viewer's own uid; for a shared one, someone else's. The only thing
   * that decides the storage prefix photographs live under (#483 follow-up),
   * since a grantee's own uid never appears in a shared item's path. */
  ownerUserId: string;
  /** True for a category shared with, not owned by, the viewer. Every
   * write control (new entry, edit, delete, upload) is hidden rather than
   * merely disabled -- RLS already refuses the writes themselves, so this
   * is UX, not the boundary (see design-decisions.md's RLS section). */
  isShared: boolean;
}) {
  const { t, tCount } = useI18n();
  const confirm = useConfirm();

  const [isCreateOpen, setCreateOpen] = useState(false);
  const [isCreateDirty, setCreateDirty] = useState(false);

  // Same reasoning as EditItemModal's guardedClose: backdrop, Escape and the
  // dialog's X all resolve to this, so none of them can silently drop a
  // half-written entry (#308). No separate Cancel button exists for create,
  // so unlike edit there's only the one path to guard here.
  const guardedCloseCreate = useCallback(() => {
    if (!isCreateDirty) {
      setCreateOpen(false);
      return;
    }
    void (async () => {
      if (await confirm(t('item_create.confirm_discard'))) {
        setCreateDirty(false);
        setCreateOpen(false);
      }
    })();
  }, [isCreateDirty, confirm, t]);

  // Declared up here, ahead of the map, because the map is filtered by the
  // same term the list is: they are one filtered set drawn two ways.
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQDebounced(q.trim()), 200);
    return () => clearTimeout(id);
  }, [q]);

  const [mapOpen, setMapOpen] = useState(false);

  const { items, total, loading, page, setPage, totalPages, reload, setItems } =
    useItems(categoryId, qDebounced);
  const searchStatus = searchStatusFor(qDebounced, total);

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
  } = useItemImages(ownerUserId);

  const itemIdsKey = items.map((i) => i.id).join(',');
  useEffect(() => {
    if (!itemIdsKey) return;
    void refreshAllImages(itemIdsKey.split(','));
  }, [itemIdsKey, refreshAllImages]);

  const { saveEdit, isSaving, removeItem } = useItemMutations({
    items,
    setItems,
    reload,
    deleteAllItemImages,
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

  const openEdit = (it: ItemLite) => {
    setEditingItem(it);
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
          {/* Absent, not disabled, same as everything else RLS already
              refuses on a shared category -- there is nothing this button
              could open that wouldn't immediately fail to save. */}
          {!isShared && (
            <button
              type="button"
              // Named for the end-to-end suite: its label is translated.
              data-testid="new-entry"
              onClick={() => setCreateOpen(true)}
              className="flex-1 sm:flex-none min-h-11 px-4 flex items-center justify-center gap-2 rounded-sm bg-primary text-primary-foreground font-label text-xs hover:opacity-90 transition-opacity"
            >
              <Icon
                icon={IconType.Plus}
                className="w-4 h-4"
                aria-hidden="true"
              />
              {t('item_create.new_entry')}
            </button>
          )}

          <button
            type="button"
            // Named for the end-to-end suite: an icon button whose only label
            // is translated.
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

      {/* `searchStatus` -- not raw `qDebounced` -- decides what this says: a
          1-2 char term (or a non-ASCII one below its own, lower floor) earns
          no filter from listItems, so announcing a count here would be the
          unfiltered category's count passed off as a search result (#307). */}
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
        // `total > 0` alongside an empty `items` is not "no entries": it is
        // the one-render gap between a silent refetch landing for a page
        // that no longer exists (deleting the last card on the last page)
        // and the corrected page's own fetch resolving. `currentPage`
        // (see clampPage) has already moved on by this point, so the
        // re-fetch is already in flight -- painting the empty state here
        // would flash "No entries yet" over entries that are still there.
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
          // Cards are detached objects on mobile too, not a full-bleed
          // stack: they keep the page's own side margin, so paper shows on
          // all four edges of every card. Edge-to-edge cards had no left or
          // right boundary at all, which left a thin horizontal band as the
          // single cue separating one entry from the next -- not enough to
          // bind a caption and its buttons to the photograph above them.
          className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}
        >
          {items.map((it, idx) => (
            <ItemCard
              key={it.id}
              item={it}
              imgs={images[it.id] ?? EMPTY_IMAGES}
              pendingUploads={pendingUploads[it.id] ?? 0}
              imagesLoading={loadingItems.has(it.id)}
              deletingPath={deletingPath}
              onUpload={(f) => void uploadImage(it.id, f)}
              onEditItem={() => openEdit(it)}
              onDeleteItem={() => void removeItem(it.id)}
              onDeleteImage={(img) => void deleteImage(it.id, img)}
              onOpenModal={(index) => setModalState({ itemId: it.id, index })}
              // The grid is up to 3 columns wide (lg:grid-cols-3), so the
              // first row -- and the LCP candidate within it -- is always
              // among these three regardless of viewport.
              priority={idx < 3}
              readOnly={isShared}
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
        readOnly={isShared}
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
