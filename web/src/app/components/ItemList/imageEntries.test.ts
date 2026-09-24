import { describe, expect, it } from 'vitest';

import {
  entryDataOf,
  groupImageRows,
  pageImageRowsFor,
  RENDERABLE_PLATES,
  STRIP_MAX,
  toImageEntries,
} from './imageEntries';
import { sevenPhotos } from './imageEntries.test-support';

describe('groupImageRows', () => {
  it("groups a row by item, keyed by the row's own id", () => {
    const result = groupImageRows([
      {
        id: 'img-1',
        item_id: 'item-1',
        path_full: 'p/1/a.webp',
        path_thumb: 'p/1/a.thumb.webp',
      },
    ]);
    expect(result.get('item-1')?.get('img-1')).toEqual({
      id: 'img-1',
      pathFull: 'p/1/a.webp',
      pathThumb: 'p/1/a.thumb.webp',
    });
  });

  it('leaves pathThumb undefined for a row with none', () => {
    const result = groupImageRows([
      {
        id: 'img-1',
        item_id: 'item-1',
        path_full: 'p/1/a.webp',
        path_thumb: null,
      },
    ]);
    expect(result.get('item-1')?.get('img-1')?.pathThumb).toBeUndefined();
  });

  // The grid hangs photographs in query order with an upload's placeholder last, so order must survive.
  it("carries row order through to each item's entries", () => {
    const result = groupImageRows([
      {
        id: 'oldest',
        item_id: 'item-1',
        path_full: 'p/1/oldest.webp',
        path_thumb: null,
      },
      {
        id: 'middle',
        item_id: 'item-1',
        path_full: 'p/1/middle.webp',
        path_thumb: null,
      },
      {
        id: 'newest',
        item_id: 'item-1',
        path_full: 'p/1/newest.webp',
        path_thumb: null,
      },
    ]);
    expect(Array.from(result.get('item-1')?.keys() ?? [])).toEqual([
      'oldest',
      'middle',
      'newest',
    ]);
  });

  it('separates rows belonging to different items', () => {
    const result = groupImageRows([
      { id: 'a', item_id: 'item-1', path_full: 'p/1/a.webp', path_thumb: null },
      { id: 'b', item_id: 'item-2', path_full: 'p/2/b.webp', path_thumb: null },
    ]);
    expect(result.size).toBe(2);
    expect(result.get('item-1')?.size).toBe(1);
    expect(result.get('item-2')?.size).toBe(1);
  });

  it('returns an empty map for an empty row list', () => {
    expect(groupImageRows([]).size).toBe(0);
  });
});

describe('toImageEntries', () => {
  const entryData = new Map([
    ['a', { id: 'a', pathFull: 'p/a.webp', pathThumb: 'p/a.thumb.webp' }],
    ['b', { id: 'b', pathFull: 'p/b.webp', pathThumb: undefined }],
  ]);

  it('attaches signed URLs to both full and thumb paths', () => {
    const signed = new Map([
      ['p/a.webp', 'https://signed/a'],
      ['p/a.thumb.webp', 'https://signed/a-thumb'],
      ['p/b.webp', 'https://signed/b'],
    ]);
    const result = toImageEntries(entryData, signed);
    expect(result).toEqual([
      {
        id: 'a',
        pathFull: 'p/a.webp',
        urlFull: 'https://signed/a',
        pathThumb: 'p/a.thumb.webp',
        urlThumb: 'https://signed/a-thumb',
      },
      {
        id: 'b',
        pathFull: 'p/b.webp',
        urlFull: 'https://signed/b',
        pathThumb: undefined,
        urlThumb: undefined,
      },
    ]);
  });

  it('drops an entry whose full path has no signed URL, even if signing partially succeeded', () => {
    const signed = new Map([['p/a.thumb.webp', 'https://signed/a-thumb']]);
    const result = toImageEntries(entryData, signed);
    expect(result).toEqual([]);
  });
});

describe('pageImageRowsFor', () => {
  const rows = [
    { id: 'p1', item_id: 'a', path_full: 'u/a/p1.webp', path_thumb: null },
  ];

  it('hands back the carried rows for the exact item set they were read with', () => {
    expect(pageImageRowsFor({ itemIdsKey: 'a,b', rows }, 'a,b')).toBe(rows);
  });

  it('refuses them for any other item set', () => {
    expect(pageImageRowsFor({ itemIdsKey: 'a,b', rows }, 'b')).toBeNull();
  });

  it('has nothing when the read carried no rows', () => {
    expect(pageImageRowsFor(null, 'a,b')).toBeNull();
  });
});

describe('what a card can render', () => {
  it('is the hero plus a strip of four', () => {
    expect(STRIP_MAX).toBe(4);
    expect(RENDERABLE_PLATES).toBe(5);
  });
});

describe('toImageEntries past the plates', () => {
  it('keeps an unsigned photograph past the plates, so it still counts', () => {
    const result = toImageEntries(sevenPhotos(), new Map());
    // The first five are dropped unsigned, as before; the last two are kept.
    expect(result.map((entry) => entry.id)).toEqual(['img-5', 'img-6']);
    expect(result[0].urlFull).toBeUndefined();
  });
});

describe('entryDataOf', () => {
  it('gives back the paths each shown entry was signed from, in order', () => {
    const data = entryDataOf([
      {
        id: 'a',
        pathFull: 'p/a.webp',
        urlFull: 'u',
        pathThumb: 'p/a.thumb.webp',
      },
      { id: 'b', pathFull: 'p/b.webp' },
    ]);

    expect([...data]).toEqual([
      ['a', { id: 'a', pathFull: 'p/a.webp', pathThumb: 'p/a.thumb.webp' }],
      ['b', { id: 'b', pathFull: 'p/b.webp', pathThumb: undefined }],
    ]);
  });
});
