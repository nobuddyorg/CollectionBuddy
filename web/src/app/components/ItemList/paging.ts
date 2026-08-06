/**
 * The arithmetic behind a page of entries.
 *
 * Lifted out of useItems because it is the part that can be wrong: a page
 * number that outlives the entries it was pointing at, or a range that asks
 * the database for rows either side of the ones wanted. Both are off-by-one
 * territory, and both used to sit inline in a hook that no test could reach.
 */

/** Entries per page. Nine fills three desktop rows of three. */
export const PAGE_SIZE = 9;

/** How many pages a collection of this size needs. Nothing needs no pages. */
export function pageCount(total: number): number {
  return Math.ceil(total / PAGE_SIZE);
}

/**
 * The page actually being shown, which is not always the page asked for.
 *
 * Deleting the last entry of the last page leaves a page number pointing past
 * the end. Clamping here rather than writing a corrected number back into
 * state matters: this is derived from state that already exists, so it is
 * right on the render the deletion happens rather than one render later --
 * and that later render is one where the grid asks for an out-of-bounds slice
 * and comes back empty with no page marked active.
 *
 * An empty collection still shows page 1, because "page 0 of 0" is not a
 * thing to put on a screen.
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
