// Lapsed at the expiry instant itself, as the access check's `expires_at > now()` has it.
export function isShareExpired({
  expiresAt,
  now,
}: {
  expiresAt: string;
  now: Date;
}): boolean {
  return new Date(expiresAt).getTime() <= now.getTime();
}
