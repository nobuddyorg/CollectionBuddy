/** The SQLSTATE 0009_user_quotas.sql raises when a write would pass a quota. */
const QUOTA_EXCEEDED = 'PT507';

/** Whether a write was refused for a per-owner quota, directly or anywhere down its `cause` chain. */
export function isQuotaExceeded(error: unknown): boolean {
  for (
    let current = error;
    current;
    current = (current as { cause?: unknown }).cause
  ) {
    if ((current as { code?: unknown }).code === QUOTA_EXCEEDED) return true;
  }
  return false;
}
