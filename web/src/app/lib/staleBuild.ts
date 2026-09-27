/** Long enough that a chunk still missing after the recovery reload shows the error screen instead of looping. */
export const RELOAD_GUARD_MS = 30_000;

/** Whether a render error is a lazy chunk the server no longer has (a deploy removed it) and a reload is not already recent. */
export function shouldReloadForStaleBuild({
  error,
  lastReloadAt,
  now,
}: {
  error: Error;
  lastReloadAt: number;
  now: number;
}): boolean {
  // Turbopack's and webpack's name for a chunk that failed to load.
  return (
    error.name === 'ChunkLoadError' && now - lastReloadAt >= RELOAD_GUARD_MS
  );
}
