import { listItems } from '../../data/items';
import { pageRange } from './paging';

type FirstPage = ReturnType<typeof listItems>;

let pending: { categoryId: string; page: FirstPage } | null = null;

/**
 * Starts reading a category's unsearched first page before ItemList mounts,
 * so on a cold start it overlaps the category list instead of waiting on it
 * (#627). A category the caller can no longer read just comes back empty.
 */
export function prefetchFirstPage(
  categoryId: string,
  read: typeof listItems = listItems,
): void {
  const { from, to } = pageRange(1);
  pending = { categoryId, page: read({ categoryId, search: '', from, to }) };
}

/** The prefetched read for `categoryId`, handed out once; any other is dropped. */
export function takePrefetchedFirstPage(categoryId: string): FirstPage | null {
  const taken = pending?.categoryId === categoryId ? pending.page : null;
  pending = null;
  return taken;
}
