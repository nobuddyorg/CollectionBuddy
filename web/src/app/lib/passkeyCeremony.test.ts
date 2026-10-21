import { describe, expect, it } from 'vitest';

import { isAlreadyRegistered, isDismissedCeremony } from './passkeyCeremony';

// auth-js's WebAuthnError: an Error with a `code`, and the browser's DOMException as `cause`.
function webAuthnError(code: string, causeName?: string) {
  const cause = causeName
    ? Object.assign(new Error('x'), { name: causeName })
    : undefined;
  return Object.assign(new Error('ceremony failed', { cause }), { code });
}

describe('isDismissedCeremony', () => {
  it.each(['NotAllowedError', 'AbortError'])(
    'treats a prompt that ended in %s as dismissed',
    (name) => {
      expect(
        isDismissedCeremony(
          webAuthnError('ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY', name),
        ),
      ).toBe(true);
    },
  );

  it('treats a ceremony auth-js aborted itself as dismissed', () => {
    expect(isDismissedCeremony(webAuthnError('ERROR_CEREMONY_ABORTED'))).toBe(
      true,
    );
  });

  it('reports any other browser failure', () => {
    expect(
      isDismissedCeremony(
        webAuthnError('ERROR_INVALID_RP_ID', 'SecurityError'),
      ),
    ).toBe(false);
  });

  it('reports a server error, which has no browser cause', () => {
    expect(
      isDismissedCeremony(webAuthnError('webauthn_verification_failed')),
    ).toBe(false);
  });

  it('reports a cause that is not an Error, whatever its name', () => {
    const error = new Error('x', { cause: { name: 'NotAllowedError' } });
    expect(isDismissedCeremony(error)).toBe(false);
  });

  it('reports anything that is not an Error', () => {
    expect(isDismissedCeremony({ code: 'ERROR_CEREMONY_ABORTED' })).toBe(false);
    expect(isDismissedCeremony('NotAllowedError')).toBe(false);
  });
});

describe('isAlreadyRegistered', () => {
  it.each([
    'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED',
    'webauthn_credential_exists',
  ])('recognises %s', (code) => {
    expect(isAlreadyRegistered(webAuthnError(code))).toBe(true);
  });

  it('does not mistake another failure for a repeat', () => {
    expect(isAlreadyRegistered(webAuthnError('too_many_passkeys'))).toBe(false);
    expect(isAlreadyRegistered(new Error('no code'))).toBe(false);
  });

  it('needs an Error, not just the code', () => {
    expect(isAlreadyRegistered({ code: 'webauthn_credential_exists' })).toBe(
      false,
    );
  });
});
