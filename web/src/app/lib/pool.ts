// Every worker throws a real Error; this only keeps a stray non-Error from surfacing raw.
function throwAsError(error: unknown): never {
  if (error instanceof Error) throw error;
  throw new Error(String(error));
}

/** First rejection stops every runner picking up more; in-flight work settles, then it is rethrown. */
export async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  // One shared iterator is the hand-off: each pull claims the next item exactly once.
  const remaining = items[Symbol.iterator]();
  let poolError: unknown;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (let step = remaining.next(); !step.done; step = remaining.next()) {
        if (poolError !== undefined) return;
        try {
          await worker(step.value);
        } catch (error) {
          if (poolError === undefined) poolError = error;
          return;
        }
      }
    },
  );
  await Promise.all(runners);
  if (poolError !== undefined) throwAsError(poolError);
}
