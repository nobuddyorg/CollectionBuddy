/** Exponential backoff delay for retry attempt `n` (0-indexed): `baseMs`,
 * then 2x, 4x, and so on. */
export function backoffDelayMs(baseMs: number, attempt: number): number {
  return baseMs * 2 ** attempt;
}
