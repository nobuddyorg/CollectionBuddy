/** The SQLSTATE 0009_user_quotas.sql raises when a write would pass a quota. */
const QUOTA_EXCEEDED = 'PT507';

/** The `details` 0025 gives the refusal when the whole bucket, not one owner, is past its ceiling. */
const WHOLE_APP = 'project';

type Refusal = { code?: unknown; details?: unknown };

function anyCause(
  error: unknown,
  matches: (refusal: Refusal) => boolean,
): boolean {
  for (
    let current = error;
    current;
    current = (current as { cause?: unknown }).cause
  ) {
    if (matches(current)) return true;
  }
  return false;
}

/** Whether a write was refused for a quota, directly or anywhere down its `cause` chain. */
export function isQuotaExceeded(error: unknown): boolean {
  return anyCause(error, (refusal) => refusal.code === QUOTA_EXCEEDED);
}

/** Whether a photograph was refused because the app's photo storage as a whole is full, not the owner's share of it. */
export function isPhotoStorageFull(error: unknown): boolean {
  return anyCause(
    error,
    (refusal) =>
      refusal.code === QUOTA_EXCEEDED && refusal.details === WHOLE_APP,
  );
}
