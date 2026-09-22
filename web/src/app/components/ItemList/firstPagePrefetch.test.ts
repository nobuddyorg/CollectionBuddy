import { describe, expect, it, vi } from 'vitest';

import type { listItems } from '../../data/items';
import {
  prefetchFirstPage,
  takePrefetchedFirstPage,
} from './firstPagePrefetch';
import { PAGE_SIZE } from './paging';

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
  it('reads the unsearched first page of the category', () => {
    const { read } = fakeRead();

    prefetchFirstPage('cat-1', read);

    expect(read).toHaveBeenCalledWith({
      categoryId: 'cat-1',
      search: '',
      from: 0,
      to: PAGE_SIZE - 1,
    });
    void takePrefetchedFirstPage('cat-1');
  });

  it('hands the read to the category it was started for, exactly once', () => {
    const { page, read } = fakeRead();
    prefetchFirstPage('cat-1', read);

    expect(takePrefetchedFirstPage('cat-1')).toBe(page);
    expect(takePrefetchedFirstPage('cat-1')).toBeNull();
  });

  it('drops a read started for a different category', () => {
    const { read } = fakeRead();
    prefetchFirstPage('stale', read);

    expect(takePrefetchedFirstPage('cat-1')).toBeNull();
    expect(takePrefetchedFirstPage('stale')).toBeNull();
  });

  it('keeps only the latest read', () => {
    const first = fakeRead();
    const second = fakeRead();
    prefetchFirstPage('cat-1', first.read);
    prefetchFirstPage('cat-1', second.read);

    expect(takePrefetchedFirstPage('cat-1')).toBe(second.page);
  });

  it('has nothing to hand out before anything was started', () => {
    expect(takePrefetchedFirstPage('cat-1')).toBeNull();
  });
});
