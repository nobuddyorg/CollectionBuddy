/**
 * A worker pool where the first rejection stops every runner from picking
 * up further items (in-flight work settles on its own) and is rethrown once
 * they all have -- for callers where one failure means the whole run must
 * stop, not skip one entry and carry on.
 */

// Every worker here only ever throws a real Error; this is a fallback so a
// caught non-Error value still comes out as one, not an expected path.
function throwAsError(err: unknown): never {
  if (err instanceof Error) throw err;
  throw new Error(String(err));
}

export async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  // One iterator shared by every runner is the hand-off itself: each pull
  // claims the next item exactly once, with no cursor to keep in step.
  const remaining = items[Symbol.iterator]();
  let poolError: unknown;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (let it = remaining.next(); !it.done; it = remaining.next()) {
        if (poolError !== undefined) return;
        try {
          await worker(it.value);
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
