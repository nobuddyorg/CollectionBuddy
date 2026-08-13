import { describe, expect, it } from 'vitest';

import { imagePrefix } from './images';

describe('imagePrefix', () => {
  it('joins the user and item id the same way every caller used to by hand', () => {
    expect(imagePrefix('user-1', 'item-1')).toBe('user-1/item-1');
  });
});
