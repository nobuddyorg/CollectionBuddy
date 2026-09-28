import { describe, expect, it, vi } from 'vitest';

import { readAllChunks, readAllKeysetPages, readAllPages } from './pages';

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

  // A full last page looks like there may be more, so it costs one empty request rather than dropping rows.
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

  // A reader answering with neither rows nor an error must end the walk, not be read for a length.
  it('stops on a page that answers with nothing at all', async () => {
    const readPage = vi.fn().mockResolvedValue({ data: null, error: null });

    expect(await readAllPages(10, readPage)).toEqual({ data: [], error: null });
    expect(readPage).toHaveBeenCalledTimes(1);
  });
});

type Row = { key: number };

/** A table read the way a keyset query does: sorted by key, strictly past `after`, `size` rows at a time. */
function keysetTable(keys: number[], size: number) {
  const table = keys.map((key) => ({ key }));
  const readPage = vi.fn(async (after: Row | null) => ({
    data: table
      .filter((row) => after === null || row.key > after.key)
      .slice(0, size),
    error: null,
  }));
  return { table, readPage };
}

describe('readAllKeysetPages', () => {
  it('asks for the first page with no key, then after the last row of each full page', async () => {
    const { readPage } = keysetTable([1, 2, 3, 4, 5], 2);

    const result = await readAllKeysetPages(2, readPage);

    expect(result).toEqual({
      data: [1, 2, 3, 4, 5].map((key) => ({ key })),
      error: null,
    });
    expect(readPage.mock.calls).toEqual([[null], [{ key: 2 }], [{ key: 4 }]]);
  });

  it('stops after one short page', async () => {
    const { readPage } = keysetTable([1], 2);

    await readAllKeysetPages(2, readPage);

    expect(readPage).toHaveBeenCalledTimes(1);
  });

  // A full last page looks like there may be more, so it costs one empty request rather than dropping rows.
  it('asks once more after a page that fills exactly, then stops', async () => {
    const { readPage } = keysetTable([1, 2], 2);

    const result = await readAllKeysetPages(2, readPage);

    expect(result.data).toEqual([{ key: 1 }, { key: 2 }]);
    expect(readPage).toHaveBeenCalledTimes(2);
  });

  // An offset read of page two after row 1 goes would start at row 4, skipping row 3.
  it('skips no row when a row already read disappears between pages', async () => {
    const { table, readPage } = keysetTable([1, 2, 3, 4, 5], 2);
    const read = readPage.getMockImplementation()!;
    readPage.mockImplementationOnce(async (after) => {
      const page = await read(after);
      table.shift();
      return page;
    });

    const result = await readAllKeysetPages(2, readPage);

    expect(result.data).toEqual([1, 2, 3, 4, 5].map((key) => ({ key })));
  });

  it('stops on a page that answers with nothing at all', async () => {
    const readPage = vi.fn().mockResolvedValue({ data: null, error: null });

    expect(await readAllKeysetPages(10, readPage)).toEqual({
      data: [],
      error: null,
    });
    expect(readPage).toHaveBeenCalledTimes(1);
  });

  it('gives up on the first failing page, keeping nothing it had read', async () => {
    const boom = new Error('boom');
    const readPage = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ key: 1 }], error: null })
      .mockResolvedValueOnce({ data: null, error: boom });

    const result = await readAllKeysetPages(1, readPage);

    expect(result).toEqual({ data: null, error: boom });
    expect(readPage).toHaveBeenCalledTimes(2);
  });
});

/** Resolves when `release` is called, so a test decides the finishing order. */
function deferred<T>() {
  let release!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('readAllChunks', () => {
  it('joins every chunk in chunk order, whatever order they finish in', async () => {
    const first = deferred<{ data: string[]; error: null }>();
    const second = deferred<{ data: string[]; error: null }>();
    const reads = { a: first.promise, b: second.promise };

    const result = readAllChunks(['a', 'b'] as const, (chunk) => reads[chunk]);
    second.release({ data: ['b1', 'b2'], error: null });
    first.release({ data: ['a1'], error: null });

    expect(await result).toEqual({ data: ['a1', 'b1', 'b2'], error: null });
  });

  it('reads nothing and answers empty for no chunks', async () => {
    const readChunk = vi.fn();

    expect(await readAllChunks([], readChunk)).toEqual({
      data: [],
      error: null,
    });
    expect(readChunk).not.toHaveBeenCalled();
  });

  it('keeps at most six chunk reads in flight', async () => {
    let inFlight = 0;
    let peak = 0;
    await readAllChunks(
      Array.from({ length: 20 }, (_, i) => i),
      async (chunk) => {
        inFlight++;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 1));
        inFlight--;
        return { data: [chunk], error: null };
      },
    );

    expect(peak).toBe(6);
  });

  it('returns the first failure with no partial data, and starts no further chunks', async () => {
    const boom = { message: 'boom' };
    const readChunk = vi.fn(async (chunk: number) =>
      chunk === 0
        ? { data: null, error: boom }
        : { data: [chunk], error: null },
    );

    const result = await readAllChunks(
      Array.from({ length: 10 }, (_, i) => i),
      readChunk,
    );

    expect(result).toEqual({ data: null, error: boom });
    expect(readChunk.mock.calls.length).toBeLessThan(10);
  });

  it('reports the earliest failure when a later chunk also fails', async () => {
    const early = deferred<{ data: null; error: { message: string } }>();
    const late = deferred<{ data: null; error: { message: string } }>();
    const reads = [early.promise, late.promise];

    const result = readAllChunks([0, 1], (chunk) => reads[chunk]);
    early.release({ data: null, error: { message: 'early' } });
    await Promise.resolve();
    late.release({ data: null, error: { message: 'late' } });

    expect(await result).toEqual({ data: null, error: { message: 'early' } });
  });

  it('turns a chunk read that throws into the returned error', async () => {
    const offline = new Error('offline');

    const result = await readAllChunks([0], async () => {
      throw offline;
    });

    expect(result).toEqual({ data: null, error: offline });
  });
});
