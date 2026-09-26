import { beforeEach, describe, expect, it, vi } from 'vitest';

import { REMOVE_OBJECTS_BATCH_SIZE, removeImageObjects } from './images';
import { objectPathsOf, removeObjectsThenRows } from './imageRemoval';

vi.mock('./images', () => ({
  REMOVE_OBJECTS_BATCH_SIZE: 2,
  removeImageObjects: vi.fn(),
}));

function succeeds() {
  return vi.fn(async () => ({ error: null }));
}

describe('objectPathsOf', () => {
  it('names the full size and the thumbnail', () => {
    expect(
      objectPathsOf({
        path_full: 'u/i/a.webp',
        path_thumb: 'u/i/a.thumb.webp',
      }),
    ).toEqual(['u/i/a.webp', 'u/i/a.thumb.webp']);
  });

  it('names only the full size when the row has no thumbnail', () => {
    expect(
      objectPathsOf({ path_full: 'u/i/a.webp', path_thumb: null }),
    ).toEqual(['u/i/a.webp']);
  });
});

describe('removeObjectsThenRows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('removes every object, in batches Storage accepts, before deleting the rows', async () => {
    const removeObjects = succeeds();
    const deleteRows = succeeds();

    const outcome = await removeObjectsThenRows({
      paths: ['a', 'b', 'c'],
      deleteRows,
      removeObjects,
    });

    expect(outcome).toEqual({ error: null });
    expect(REMOVE_OBJECTS_BATCH_SIZE).toBe(2);
    expect(removeObjects.mock.calls).toEqual([[['a', 'b']], [['c']]]);
    expect(deleteRows).toHaveBeenCalledOnce();
    expect(removeObjects.mock.invocationCallOrder[1]).toBeLessThan(
      deleteRows.mock.invocationCallOrder[0],
    );
  });

  it('stops at the first batch Storage refuses and leaves the rows, so they still name the rest', async () => {
    const refusal = new Error('storage down');
    const removeObjects = vi.fn(async () => ({ error: refusal }));
    const deleteRows = succeeds();

    const outcome = await removeObjectsThenRows({
      paths: ['a', 'b', 'c'],
      deleteRows,
      removeObjects,
    });

    expect(outcome).toEqual({ error: refusal });
    expect(removeObjects).toHaveBeenCalledOnce();
    expect(deleteRows).not.toHaveBeenCalled();
  });

  it("hands back the row delete's own failure", async () => {
    const rowError = new Error('rls');
    const outcome = await removeObjectsThenRows({
      paths: ['a'],
      deleteRows: vi.fn(async () => ({ error: rowError })),
      removeObjects: succeeds(),
    });

    expect(outcome).toEqual({ error: rowError });
  });

  it('sends Storage nothing when there are no objects, and still deletes the rows', async () => {
    const removeObjects = succeeds();
    const deleteRows = succeeds();

    await removeObjectsThenRows({ paths: [], deleteRows, removeObjects });

    expect(removeObjects).not.toHaveBeenCalled();
    expect(deleteRows).toHaveBeenCalledOnce();
  });

  it('removes through the photographs bucket unless told otherwise', async () => {
    vi.mocked(removeImageObjects).mockResolvedValue({
      data: [],
      error: null,
    });

    await removeObjectsThenRows({ paths: ['a'], deleteRows: succeeds() });

    expect(removeImageObjects).toHaveBeenCalledWith(['a']);
  });
});
