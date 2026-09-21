/** Exponential backoff delay for retry attempt `n` (0-indexed): `baseMs`,
 * then 2x, 4x, and so on. */
export function backoffDelayMs(baseMs: number, attempt: number): number {
  return baseMs * 2 ** attempt;
}

/** The attempt numbers a retry loop walks: `0, 1, ... count - 1`. A list
 * rather than a counter, so "three attempts" is a value a test can read and
 * a loop cannot drift away from. */
export function attempts(count: number): number[] {
  return Array.from({ length: count }, (_, attempt) => attempt);
}
