import { describe, expect, it } from 'vitest';

import { pairImageEntries } from './useItemImages';

describe('pairImageEntries', () => {
  const prefix = 'user-1/item-1';

  it('pairs a full image with its thumbnail', () => {
    const result = pairImageEntries(
      [{ name: 'abc.webp' }, { name: 'abc.thumb.webp' }],
      prefix,
    );
    expect(result.get('abc')).toEqual({
      pathFull: `${prefix}/abc.webp`,
      pathThumb: `${prefix}/abc.thumb.webp`,
    });
  });

  it('keeps a full image with no thumbnail, with pathThumb undefined', () => {
    const result = pairImageEntries([{ name: 'solo.webp' }], prefix);
    expect(result.get('solo')).toEqual({
      pathFull: `${prefix}/solo.webp`,
      pathThumb: undefined,
    });
  });

  it('drops an orphaned thumbnail with no matching full image', () => {
    const result = pairImageEntries([{ name: 'orphan.thumb.webp' }], prefix);
    expect(result.has('orphan')).toBe(false);
    expect(result.size).toBe(0);
  });

  it('is unaffected by listing order', () => {
    const thumbFirst = pairImageEntries(
      [{ name: 'xyz.thumb.webp' }, { name: 'xyz.webp' }],
      prefix,
    );
    expect(thumbFirst.get('xyz')).toEqual({
      pathFull: `${prefix}/xyz.webp`,
      pathThumb: `${prefix}/xyz.thumb.webp`,
    });
  });

  it('pairs multiple independent images from one flat listing', () => {
    const result = pairImageEntries(
      [
        { name: 'a.webp' },
        { name: 'a.thumb.webp' },
        { name: 'b.webp' },
        { name: 'b.thumb.webp' },
      ],
      prefix,
    );
    expect(result.size).toBe(2);
    expect(result.get('a')?.pathThumb).toBe(`${prefix}/a.thumb.webp`);
    expect(result.get('b')?.pathThumb).toBe(`${prefix}/b.thumb.webp`);
  });
});
