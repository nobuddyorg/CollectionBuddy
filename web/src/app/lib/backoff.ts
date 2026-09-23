/** Delay before retry `attempt` (0-indexed): `baseMs`, then 2x, 4x, and so on. */
export function backoffDelayMs(baseMs: number, attempt: number): number {
  return baseMs * 2 ** attempt;
}

/** The attempt numbers a retry loop walks, as a list so "three attempts" is a value a test can read. */
export function attempts(count: number): number[] {
  return Array.from({ length: count }, (_, attempt) => attempt);
}
