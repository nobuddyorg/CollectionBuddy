import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  clampPage,
  getPaginationItems,
  normalizePageSize,
  pageCount,
  pageHolding,
  pageRange,
} from './paging';

describe('the page sizes', () => {
  it('offers 6, 9, 12 and 24, and keeps 9, three desktop rows of three, as the default', () => {
    expect(PAGE_SIZES).toEqual([6, 9, 12, 24]);
    expect(DEFAULT_PAGE_SIZE).toBe(9);
  });

  it.each([
    ['6', 6],
    ['12', 12],
    ['24', 24],
    ['9', 9],
    [null, 9],
    ['7', 9],
    ['24 ', 9],
    ['', 9],
  ])('reads a stored %j as %d', (stored, size) => {
    expect(normalizePageSize(stored)).toBe(size);
  });
});

describe('a page size other than the default', () => {
  it('counts and ranges pages of that size', () => {
    expect(pageCount(25, 24)).toBe(2);
    expect(pageCount(24, 24)).toBe(1);
    expect(pageCount(13, 6)).toBe(3);
    expect(pageRange(2, 6)).toEqual({ from: 6, to: 11 });
    expect(pageRange(3, 12)).toEqual({ from: 24, to: 35 });
  });
});

describe('pageHolding', () => {
  // Page 3 at 9 starts with the 19th entry (index 18).
  it.each([
    [{ from: 9, to: 6 }, 4],
    [{ from: 9, to: 12 }, 2],
    [{ from: 9, to: 24 }, 1],
    [{ from: 9, to: 9 }, 3],
  ] as const)(
    'keeps the entry first on page 3 on screen, %j: page %d',
    (sizes, page) => {
      expect(pageHolding(3, sizes)).toBe(page);
    },
  );

  it('stays on page 1 from page 1, whatever the sizes', () => {
    expect(pageHolding(1, { from: 24, to: 6 })).toBe(1);
    expect(pageHolding(1, { from: 6, to: 24 })).toBe(1);
  });

  // Page 2 at 24 starts with index 24, the first of page 5 at 6.
  it('goes forward when the pages get smaller', () => {
    expect(pageHolding(2, { from: 24, to: 6 })).toBe(5);
  });
});

describe('pageCount', () => {
  it('has no pages for an empty collection', () => {
    expect(pageCount(0, DEFAULT_PAGE_SIZE)).toBe(0);
  });

  it('gives a single entry a page of its own', () => {
    expect(pageCount(1, DEFAULT_PAGE_SIZE)).toBe(1);
  });

  // Either side of a full page, where a rounding mistake leaves a page of entries nobody can reach.
  it('fills one page exactly before opening a second', () => {
    expect(pageCount(DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE)).toBe(1);
    expect(pageCount(DEFAULT_PAGE_SIZE + 1, DEFAULT_PAGE_SIZE)).toBe(2);
  });

  it('rounds a part-full last page up rather than dropping it', () => {
    expect(pageCount(DEFAULT_PAGE_SIZE * 2 - 1, DEFAULT_PAGE_SIZE)).toBe(2);
    expect(pageCount(DEFAULT_PAGE_SIZE * 2, DEFAULT_PAGE_SIZE)).toBe(2);
    expect(pageCount(DEFAULT_PAGE_SIZE * 2 + 1, DEFAULT_PAGE_SIZE)).toBe(3);
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
    expect(pageRange(1, DEFAULT_PAGE_SIZE)).toEqual({
      from: 0,
      to: DEFAULT_PAGE_SIZE - 1,
    });
  });

  // Inclusive at both ends, as PostgREST's range() takes; exclusive would fetch one row too few.
  it('covers exactly one page worth of rows', () => {
    const { from, to } = pageRange(1, DEFAULT_PAGE_SIZE);
    expect(to - from + 1).toBe(DEFAULT_PAGE_SIZE);
  });

  it('continues the next page where the last one stopped', () => {
    expect(pageRange(2, DEFAULT_PAGE_SIZE)).toEqual({
      from: DEFAULT_PAGE_SIZE,
      to: DEFAULT_PAGE_SIZE * 2 - 1,
    });
    expect(pageRange(1, DEFAULT_PAGE_SIZE).to + 1).toBe(
      pageRange(2, DEFAULT_PAGE_SIZE).from,
    );
  });

  it('leaves no gap and no overlap between consecutive pages', () => {
    for (let page = 1; page < 6; page += 1) {
      expect(pageRange(page + 1, DEFAULT_PAGE_SIZE).from).toBe(
        pageRange(page, DEFAULT_PAGE_SIZE).to + 1,
      );
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
