import { describe, expect, it } from 'vitest';

import {
  PAGE_SIZE,
  clampPage,
  getPaginationItems,
  pageCount,
  pageRange,
} from './paging';

describe('pageCount', () => {
  it('has no pages for an empty collection', () => {
    expect(pageCount(0)).toBe(0);
  });

  it('gives a single entry a page of its own', () => {
    expect(pageCount(1)).toBe(1);
  });

  // Either side of a full page, where a rounding mistake leaves a page of entries nobody can reach.
  it('fills one page exactly before opening a second', () => {
    expect(pageCount(PAGE_SIZE)).toBe(1);
    expect(pageCount(PAGE_SIZE + 1)).toBe(2);
  });

  it('rounds a part-full last page up rather than dropping it', () => {
    expect(pageCount(PAGE_SIZE * 2 - 1)).toBe(2);
    expect(pageCount(PAGE_SIZE * 2)).toBe(2);
    expect(pageCount(PAGE_SIZE * 2 + 1)).toBe(3);
  });
});

describe('clampPage', () => {
  it('leaves a page that exists alone', () => {
    expect(clampPage(2, 5)).toBe(2);
  });

  // Deleting the last page's last entry leaves a page number pointing past the end.
  it('pulls a page past the end back to the last one', () => {
    expect(clampPage(5, 3)).toBe(3);
  });

  it('holds at the last page rather than one beyond it', () => {
    expect(clampPage(3, 3)).toBe(3);
    expect(clampPage(4, 3)).toBe(3);
  });

  // "Page 0 of 0" is not a thing to put on a screen.
  it('shows page one for a collection with nothing in it', () => {
    expect(clampPage(1, 0)).toBe(1);
    expect(clampPage(7, 0)).toBe(1);
  });
});

describe('pageRange', () => {
  it('starts the first page at the first row', () => {
    expect(pageRange(1)).toEqual({ from: 0, to: PAGE_SIZE - 1 });
  });

  // Inclusive at both ends, as PostgREST's range() takes; exclusive would fetch one row too few.
  it('covers exactly one page worth of rows', () => {
    const { from, to } = pageRange(1);
    expect(to - from + 1).toBe(PAGE_SIZE);
  });

  it('continues the next page where the last one stopped', () => {
    expect(pageRange(2)).toEqual({ from: PAGE_SIZE, to: PAGE_SIZE * 2 - 1 });
    expect(pageRange(1).to + 1).toBe(pageRange(2).from);
  });

  it('leaves no gap and no overlap between consecutive pages', () => {
    for (let page = 1; page < 6; page += 1) {
      expect(pageRange(page + 1).from).toBe(pageRange(page).to + 1);
    }
  });
});

describe('getPaginationItems', () => {
  it('lists every page when there are 7 or fewer', () => {
    expect(getPaginationItems(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(getPaginationItems(3, 3)).toEqual([1, 2, 3]);
  });

  it('shows a leading run and trailing ellipsis near the start', () => {
    expect(getPaginationItems(1, 10)).toEqual([1, 2, 3, 4, 5, '...', 10]);
    expect(getPaginationItems(4, 10)).toEqual([1, 2, 3, 4, 5, '...', 10]);
  });

  it('shows a leading ellipsis and trailing run near the end', () => {
    expect(getPaginationItems(10, 10)).toEqual([1, '...', 6, 7, 8, 9, 10]);
    expect(getPaginationItems(7, 10)).toEqual([1, '...', 6, 7, 8, 9, 10]);
  });

  it('shows a centered window with both ellipses in the middle', () => {
    expect(getPaginationItems(5, 10)).toEqual([1, '...', 4, 5, 6, '...', 10]);
  });

  it('handles the page=5/page=totalPages-4 boundary without gaps or overlap', () => {
    // page < 5 and page > totalPages - 4 are both false at page 5, so it must be the centered window.
    expect(getPaginationItems(5, 10)).toEqual([1, '...', 4, 5, 6, '...', 10]);
    expect(getPaginationItems(6, 10)).toEqual([1, '...', 5, 6, 7, '...', 10]);
  });
});
