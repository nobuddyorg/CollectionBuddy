import { listItems } from '../../data/itemPage';
import { pageRange, type PageSize } from './paging';

type FirstPage = ReturnType<typeof listItems>;

let pending: { categoryId: string; size: PageSize; page: FirstPage } | null =
  null;

/** Reads the unsearched first page, at this device's page size, before ItemList mounts, so a cold start overlaps the category list. */
export function prefetchFirstPage(
  categoryId: string,
  size: PageSize,
  read: typeof listItems = listItems,
): void {
  const { from, to } = pageRange(1, size);
  pending = {
    categoryId,
    size,
    page: read({ categoryId, search: '', from, to }),
  };
}

/** The prefetched read for `categoryId` at `size`, handed out once; any other is dropped. */
export function takePrefetchedFirstPage(
  categoryId: string,
  size: PageSize,
): FirstPage | null {
  const taken =
    pending?.categoryId === categoryId && pending.size === size
      ? pending.page
      : null;
  pending = null;
  return taken;
}

/** Drops a read still waiting for its list, which belongs to the account that started it. */
export function forgetPrefetchedFirstPage(): void {
  pending = null;
}
