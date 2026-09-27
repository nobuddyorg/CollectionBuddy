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

/** Every page up to seven; past that, first, last and the pages around the current one, gaps as an ellipsis. */
export function getPaginationItems(
  page: number,
  totalPages: number,
): (number | string)[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (page < 5) {
    return [1, 2, 3, 4, 5, '...', totalPages];
  }
  if (page > totalPages - 4) {
    return [
      1,
      '...',
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }
  return [1, '...', page - 1, page, page + 1, '...', totalPages];
}
