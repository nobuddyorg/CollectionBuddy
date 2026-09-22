/** The SQLSTATE 0009_user_quotas.sql raises when a write would pass a quota. */
const QUOTA_EXCEEDED = 'PT507';

/**
 * Whether the database refused a write for passing a per-owner quota --
 * directly, or somewhere down an error's `cause` chain (an import wraps it).
 */
export function isQuotaExceeded(error: unknown): boolean {
  for (let e = error; e; e = (e as { cause?: unknown }).cause) {
    if ((e as { code?: unknown }).code === QUOTA_EXCEEDED) return true;
  }
  return false;
}
