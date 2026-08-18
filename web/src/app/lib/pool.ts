/**
 * A worker pool where the first rejection stops every runner from picking
 * up further items (in-flight work settles on its own) and is rethrown once
 * they all have -- for callers where one failure means the whole run must
 * stop, not skip one entry and carry on.
 */

// Every worker here only ever throws a real Error; this is a fallback so a
// caught non-Error value still comes out as one, not an expected path.
// Stryker disable all
/* v8 ignore start */
function throwAsError(err: unknown): never {
  if (err instanceof Error) throw err;
  throw new Error(String(err));
}
/* v8 ignore stop */
// Stryker restore all

export async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  let poolError: unknown;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (;;) {
        if (poolError !== undefined) return;
        const i = next++;
        if (i >= items.length) return;
        try {
          await worker(items[i]);
        } catch (err) {
          if (poolError === undefined) poolError = err;
          return;
        }
      }
    },
  );
  await Promise.all(runners);
  if (poolError !== undefined) throwAsError(poolError);
}
