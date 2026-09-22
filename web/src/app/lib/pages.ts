import { runPool } from './pool';

type ReadResult<T> =
  { data: T[]; error: null } | { data: null; error: NonNullable<unknown> };

/**
 * Every row a ranged reader will give, one page at a time until a page comes
 * back short -- how a read gets past the API's row cap without silently
 * truncating, written once rather than at each of the four readers that
 * need it.
 *
 * A page that comes back empty and one that comes back short both end the
 * walk; only a full page earns another request, so an exact multiple of
 * `pageSize` costs one extra, empty round trip rather than dropping rows.
 */
export async function readAllPages<T>(
  pageSize: number,
  // PromiseLike, not Promise: a PostgREST builder is a thenable that only
  // issues its request when awaited, which is exactly what a caller hands in.
  readPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<ReadResult<T>> {
  const rows: T[] = [];
  for (let page = 0; ; page++) {
    const from = page * pageSize;
    const { data, error } = await readPage(from, from + pageSize - 1);
    if (error) return { data: null, error };
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return { data: rows, error: null };
}

// Bounded like the photo pools in exportCategory.ts and importCategory.ts.
const CHUNK_READ_CONCURRENCY = 6;

/**
 * Every row from a set of independent chunked reads, a few in flight at a
 * time, joined in chunk order. The first failed chunk stops new ones starting
 * and is returned as the error, with no partial data.
 */
export async function readAllChunks<C, T>(
  chunks: readonly C[],
  readChunk: (chunk: C) => PromiseLike<ReadResult<T>>,
): Promise<ReadResult<T>> {
  const results: T[][] = [];
  let firstError: NonNullable<unknown> | undefined;
  try {
    await runPool(
      chunks.map((chunk, index) => ({ chunk, index })),
      CHUNK_READ_CONCURRENCY,
      async ({ chunk, index }) => {
        const result = await readChunk(chunk);
        if (result.error !== null) {
          firstError ??= result.error;
          // Only stops the pool; the caller is handed firstError itself.
          throw new Error();
        }
        results[index] = result.data;
      },
    );
  } catch (err) {
    return { data: null, error: firstError ?? (err as NonNullable<unknown>) };
  }
  return { data: results.flat(), error: null };
}
