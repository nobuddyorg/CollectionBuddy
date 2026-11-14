/** The entries a page may show: each fills whole rows at one, two and three columns but 9, today's size, kept as the default. */
export const PAGE_SIZES = [6, 9, 12, 24] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
/** Nine fills three desktop rows of three. */
export const DEFAULT_PAGE_SIZE: PageSize = 9;

/** A stored choice, or the default where there is none or it is not one of the sizes offered. */
export function normalizePageSize(stored: string | null): PageSize {
  return (
    PAGE_SIZES.find((size) => String(size) === stored) ?? DEFAULT_PAGE_SIZE
  );
}

/** How many pages a collection of this size needs. Nothing needs no pages. */
export function pageCount(total: number, size: PageSize): number {
  return Math.ceil(total / size);
}

/** Derived, so a page number left past the end corrects itself the same render, not one later. */
export function clampPage(page: number, totalPages: number): number {
  if (totalPages <= 0) return 1;
  return Math.min(page, totalPages);
}

/** Inclusive at both ends, as PostgREST's `.range()` takes; an exclusive end fetches one row too few. */
export function pageRange(
  page: number,
  size: PageSize,
): { from: number; to: number } {
  const from = (page - 1) * size;
  return { from, to: from + size - 1 };
}

/** The page, at the new size, holding the entry that was first on `page` at the old one: a new size keeps your place. */
export function pageHolding(
  page: number,
  { from, to }: { from: PageSize; to: PageSize },
): number {
  return Math.floor(((page - 1) * from) / to) + 1;
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
