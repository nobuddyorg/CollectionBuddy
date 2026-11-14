import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { listItems } from '../../data/itemPage';
import {
  forgetPrefetchedFirstPage,
  prefetchFirstPage,
  takePrefetchedFirstPage,
} from './firstPagePrefetch';
import { DEFAULT_PAGE_SIZE } from './paging';

function fakeRead() {
  const page = Promise.resolve({
    data: [],
    error: null,
    count: 0,
    imageRows: [],
  });
  return { page, read: vi.fn(() => page) as unknown as typeof listItems };
}

describe('prefetchFirstPage', () => {
  beforeEach(forgetPrefetchedFirstPage);

  it('reads the unsearched first page of the category', () => {
    const { read } = fakeRead();

    prefetchFirstPage('cat-1', 9, read);

    expect(read).toHaveBeenCalledWith({
      categoryId: 'cat-1',
      search: '',
      from: 0,
      to: DEFAULT_PAGE_SIZE - 1,
    });
  });

  it('reads the first page at the size it was given', () => {
    const { read } = fakeRead();

    prefetchFirstPage('cat-1', 24, read);

    expect(read).toHaveBeenCalledWith({
      categoryId: 'cat-1',
      search: '',
      from: 0,
      to: 23,
    });
  });

  // The list asks at its own size; a page read at another would show the wrong number of entries.
  it('drops a read made at another page size', () => {
    const { read } = fakeRead();
    prefetchFirstPage('cat-1', 9, read);

    expect(takePrefetchedFirstPage('cat-1', 24)).toBeNull();
    expect(takePrefetchedFirstPage('cat-1', 9)).toBeNull();
  });

  it('hands the read to the category it was started for, exactly once', () => {
    const { page, read } = fakeRead();
    prefetchFirstPage('cat-1', 9, read);

    expect(takePrefetchedFirstPage('cat-1', 9)).toBe(page);
    expect(takePrefetchedFirstPage('cat-1', 9)).toBeNull();
  });

  it('drops a read started for a different category', () => {
    const { read } = fakeRead();
    prefetchFirstPage('stale', 9, read);

    expect(takePrefetchedFirstPage('cat-1', 9)).toBeNull();
    expect(takePrefetchedFirstPage('stale', 9)).toBeNull();
  });

  it('keeps only the latest read', () => {
    const first = fakeRead();
    const second = fakeRead();
    prefetchFirstPage('cat-1', 9, first.read);
    prefetchFirstPage('cat-1', 9, second.read);

    expect(takePrefetchedFirstPage('cat-1', 9)).toBe(second.page);
  });

  it('has nothing to hand out before anything was started', () => {
    expect(takePrefetchedFirstPage('cat-1', 9)).toBeNull();
  });

  it('hands out nothing once forgotten', () => {
    const { read } = fakeRead();
    prefetchFirstPage('cat-1', 9, read);

    forgetPrefetchedFirstPage();

    expect(takePrefetchedFirstPage('cat-1', 9)).toBeNull();
  });
});
