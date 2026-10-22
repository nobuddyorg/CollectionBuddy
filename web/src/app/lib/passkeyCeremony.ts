// WebAuthn reports a dismissed or timed-out prompt as NotAllowedError; auth-js wraps it and keeps it as `cause`.
const DISMISSED_ERROR_NAMES: ReadonlySet<string> = new Set([
  'NotAllowedError',
  'AbortError',
]);

/** Whether a passkey ceremony failed only because the person closed the browser's prompt, which is nothing to report. */
export function isDismissedCeremony(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if ('code' in error && error.code === 'ERROR_CEREMONY_ABORTED') return true;
  const { cause } = error;
  return cause instanceof Error && DISMISSED_ERROR_NAMES.has(cause.name);
}

// The browser's code when the server's exclude list already names this authenticator; Auth's when it catches a repeat itself.
const ALREADY_REGISTERED_CODES: ReadonlySet<unknown> = new Set([
  'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED',
  'webauthn_credential_exists',
]);

/** Whether a registration failed because this authenticator already holds a passkey for the account. */
export function isAlreadyRegistered(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    ALREADY_REGISTERED_CODES.has(error.code)
  );
}
