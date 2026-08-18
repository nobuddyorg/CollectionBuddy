/**
 * The arithmetic behind a page of entries -- lifted out of useItems since
 * this is the off-by-one-prone part, so it can be tested directly.
 */

/** Entries per page. Nine fills three desktop rows of three. */
export const PAGE_SIZE = 9;

/** How many pages a collection of this size needs. Nothing needs no pages. */
export function pageCount(total: number): number {
  return Math.ceil(total / PAGE_SIZE);
}

/**
 * The page actually being shown, not always the page asked for. Deleting
 * the last entry of the last page leaves a page number pointing past the
 * end; clamping a derived value fixes it the same render, not one render
 * later. An empty collection still shows page 1, not "page 0 of 0".
 */
export function clampPage(page: number, totalPages: number): number {
  if (totalPages <= 0) return 1;
  return Math.min(page, totalPages);
}

/**
 * The row range a page covers, inclusive at both ends.
 *
 * Inclusive because that is what PostgREST's `.range()` takes -- an
 * exclusive end would quietly fetch one row too few, per page, forever.
 */
export function pageRange(page: number): { from: number; to: number } {
  const from = (page - 1) * PAGE_SIZE;
  return { from, to: from + PAGE_SIZE - 1 };
}
