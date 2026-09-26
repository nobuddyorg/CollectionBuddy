/** Delay before retry `attempt` (0-indexed): `baseMs`, then 2x, 4x, and so on. */
export function backoffDelayMs(baseMs: number, attempt: number): number {
  return baseMs * 2 ** attempt;
}

/** Whether asking again could give a different answer: 429 or 5xx; anything else only spends quota. */
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** One attempt's outcome: `retry` asks for another go, and the last attempt's `value` is what the retry returns. */
export type AttemptOutcome<T> = { value: T; retry: boolean };

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

/** Runs `run` at least once and at most `maxAttempts` times, backing off before each retry, never after the last. */
export async function retryWithBackoff<T>({
  maxAttempts,
  baseMs,
  run,
}: {
  maxAttempts: number;
  baseMs: number;
  run: () => Promise<AttemptOutcome<T>>;
}): Promise<T> {
  let outcome = await run();
  for (let retry = 0; outcome.retry && retry < maxAttempts - 1; retry += 1) {
    await sleep(backoffDelayMs(baseMs, retry));
    outcome = await run();
  }
  return outcome.value;
}

/** Callers sharing one spacer each await their turn, and turns come at least `gapMs` apart. */
export function startSpacer(gapMs: number): () => Promise<void> {
  let nextTurn = Promise.resolve();
  return () => {
    const turn = nextTurn;
    nextTurn = turn.then(() => sleep(gapMs));
    return turn;
  };
}
