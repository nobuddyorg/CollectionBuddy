/** Entries per page. Nine fills three desktop rows of three. */
export const PAGE_SIZE = 9;

/** How many pages a collection of this size needs. Nothing needs no pages. */
export function pageCount(total: number): number {
  return Math.ceil(total / PAGE_SIZE);
}

/** Derived, so a page number left past the end corrects itself the same render, not one later. */
export function clampPage(page: number, totalPages: number): number {
  if (totalPages <= 0) return 1;
  return Math.min(page, totalPages);
}

/** Inclusive at both ends, as PostgREST's `.range()` takes; an exclusive end fetches one row too few. */
export function pageRange(page: number): { from: number; to: number } {
  const from = (page - 1) * PAGE_SIZE;
  return { from, to: from + PAGE_SIZE - 1 };
}
