import { runPool } from './pool';

type ReadResult<T> =
  { data: T[]; error: null } | { data: null; error: NonNullable<unknown> };

/** All rows, walked page by page until a page comes back short; a full last page costs one empty read. */
export async function readAllPages<T>(
  pageSize: number,
  // PromiseLike: a PostgREST builder is a thenable that only issues its request when awaited.
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

/** Chunked reads a few at a time, joined in chunk order; the first failure ends it with no partial data. */
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
  } catch (error) {
    return { data: null, error: firstError ?? (error as NonNullable<unknown>) };
  }
  return { data: results.flat(), error: null };
}
