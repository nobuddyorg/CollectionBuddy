import { describe, expect, it } from 'vitest';

import { getPaginationItems } from './Pagination';

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
    // page < 5 is false at page 5, and page > totalPages - 4 (6) is also
    // false, so this must fall into the centered-window branch, not
    // silently skip straight from the leading run to the trailing one.
    expect(getPaginationItems(5, 10)).toEqual([1, '...', 4, 5, 6, '...', 10]);
    expect(getPaginationItems(6, 10)).toEqual([1, '...', 5, 6, 7, '...', 10]);
  });
});
