import { listItems } from '../../data/items';
import { pageRange } from './paging';

type FirstPage = ReturnType<typeof listItems>;

let pending: { categoryId: string; page: FirstPage } | null = null;

/** Reads the unsearched first page before ItemList mounts, so a cold start overlaps the category list. */
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
