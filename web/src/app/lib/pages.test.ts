import { describe, expect, it, vi } from 'vitest';

import { readAllPages } from './pages';

/** Pages a fixed array the way a ranged reader does -- `to` inclusive. */
function reader<T>(all: T[]) {
  return vi.fn(async (from: number, to: number) => ({
    data: all.slice(from, to + 1),
    error: null,
  }));
}

describe('readAllPages', () => {
  it('asks for the first page as an inclusive range', async () => {
    const readPage = reader([1, 2]);

    await readAllPages(10, readPage);

    expect(readPage).toHaveBeenCalledWith(0, 9);
  });

  it('stops after one short page', async () => {
    const readPage = reader([1, 2]);

    const result = await readAllPages(10, readPage);

    expect(result).toEqual({ data: [1, 2], error: null });
    expect(readPage).toHaveBeenCalledTimes(1);
  });

  it('keeps going while pages come back full, and joins them in order', async () => {
    const all = Array.from({ length: 25 }, (_, i) => i);
    const readPage = reader(all);

    const result = await readAllPages(10, readPage);

    expect(result.data).toEqual(all);
    expect(readPage.mock.calls).toEqual([
      [0, 9],
      [10, 19],
      [20, 29],
    ]);
  });

  // The boundary a page walk gets wrong: a full last page looks like there
  // may be more, so it costs one empty request rather than dropping rows.
  it('asks once more after a page that fills exactly, then stops', async () => {
    const all = Array.from({ length: 20 }, (_, i) => i);
    const readPage = reader(all);

    const result = await readAllPages(10, readPage);

    expect(result.data).toEqual(all);
    expect(readPage).toHaveBeenCalledTimes(3);
  });

  it('has nothing to collect from a reader with no rows', async () => {
    const readPage = reader<number>([]);

    expect(await readAllPages(10, readPage)).toEqual({ data: [], error: null });
    expect(readPage).toHaveBeenCalledTimes(1);
  });

  it('gives up on the first failing page, keeping nothing it had read', async () => {
    const boom = new Error('boom');
    const readPage = vi
      .fn()
      .mockResolvedValueOnce({ data: [1, 2], error: null })
      .mockResolvedValueOnce({ data: null, error: boom });

    const result = await readAllPages(2, readPage);

    expect(result).toEqual({ data: null, error: boom });
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  // A reader answering with neither rows nor an error still has to end the
  // walk rather than being read for a length.
  it('stops on a page that answers with nothing at all', async () => {
    const readPage = vi.fn().mockResolvedValue({ data: null, error: null });

    expect(await readAllPages(10, readPage)).toEqual({ data: [], error: null });
    expect(readPage).toHaveBeenCalledTimes(1);
  });
});
