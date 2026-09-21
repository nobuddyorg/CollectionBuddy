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
): Promise<
  { data: T[]; error: null } | { data: null; error: NonNullable<unknown> }
> {
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
