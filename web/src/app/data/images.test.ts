import { describe, expect, it } from 'vitest';

import { IMAGE_LIST_SORT } from './images';

// The grid stands an upload's placeholder at the end of the arrangement,
// because that is where the photograph is about to go. That only holds if the
// listing comes back oldest-first: newest-first put the new picture at the
// front instead, so it took over the hero and shoved everything else down a
// slot the moment it arrived (#265).
describe('IMAGE_LIST_SORT', () => {
  it('orders the photographs of an item oldest first', () => {
    expect(IMAGE_LIST_SORT).toEqual({ column: 'created_at', order: 'asc' });
  });
});
