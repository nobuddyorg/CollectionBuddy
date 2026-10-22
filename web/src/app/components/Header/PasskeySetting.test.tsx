// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deletePasskey,
  listPasskeys,
  registerPasskey,
  type Passkey,
} from '../../data/passkeys';
import { ToastWrapper } from '../providers.test-support';
import { PasskeySetting } from './PasskeySetting';

vi.mock('../../data/passkeys', () => ({
  listPasskeys: vi.fn(),
  registerPasskey: vi.fn(),
  deletePasskey: vi.fn(),
}));

const PHONE: Passkey = {
  id: 'passkey-phone',
  friendly_name: 'Google Password Manager',
  created_at: '2026-10-21T10:00:00Z',
};
const UNNAMED: Passkey = {
  id: 'passkey-key',
  friendly_name: '',
  created_at: '2026-10-21T11:00:00Z',
};

function listAnswers(...answers: Passkey[][]) {
  for (const passkeys of answers) {
    vi.mocked(listPasskeys).mockResolvedValueOnce({
      data: passkeys,
      error: null,
    });
  }
}

function renderSetting() {
  render(
    <ToastWrapper>
      <PasskeySetting />
    </ToastWrapper>,
  );
  return userEvent.setup();
}

// auth-js's WebAuthnError: an Error with a `code`, and the browser's DOMException as `cause`.
function ceremonyError(code: string, causeName?: string) {
  const cause = causeName
    ? Object.assign(new Error('x'), { name: causeName })
    : undefined;
  return Object.assign(new Error('ceremony failed', { cause }), { code });
}

beforeEach(() => {
  vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(listPasskeys).mockReset();
  vi.mocked(registerPasskey).mockReset();
  vi.mocked(deletePasskey).mockReset();
});

describe('PasskeySetting', () => {
  it('lists the saved passkeys by the name the device gave them', async () => {
    listAnswers([PHONE, UNNAMED]);
    renderSetting();

    const items = await screen.findAllByTestId('passkey');
    expect(items.map((item) => item.textContent)).toEqual([
      'Google Password Manager',
      'Device',
    ]);
  });

  it('shows a spinner until the list arrives, and no list when there is none', async () => {
    listAnswers([]);
    renderSetting();

    expect(screen.getByRole('status', { name: 'Loading…' })).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByRole('status', { name: 'Loading…' })).toBeNull(),
    );
    expect(screen.queryByTestId('passkey-list')).toBeNull();
  });

  it('says so when the list cannot be loaded', async () => {
    const error = new Error('offline');
    vi.mocked(listPasskeys).mockResolvedValueOnce({ data: null, error });
    renderSetting();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load your saved fingerprints.',
    );
    expect(console.error).toHaveBeenCalledWith(
      'listing passkeys failed',
      error,
    );
  });

  it('saves a fingerprint, confirms it and lists it', async () => {
    listAnswers([], [PHONE]);
    vi.mocked(registerPasskey).mockResolvedValueOnce({ error: null });
    const user = renderSetting();

    await user.click(screen.getByRole('button', { name: 'Save fingerprint' }));

    expect(await screen.findByTestId('toast')).toHaveTextContent(
      'Fingerprint saved.',
    );
    expect(await screen.findByTestId('passkey')).toHaveTextContent(
      'Google Password Manager',
    );
    expect(registerPasskey).toHaveBeenCalledOnce();
  });

  it('keeps quiet when the prompt is closed', async () => {
    listAnswers([]);
    vi.mocked(registerPasskey).mockResolvedValueOnce({
      error: ceremonyError(
        'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY',
        'NotAllowedError',
      ),
    });
    const user = renderSetting();
    const add = screen.getByRole('button', { name: 'Save fingerprint' });

    await user.click(add);

    await waitFor(() => expect(add).not.toBeDisabled());
    expect(screen.queryByTestId('toast')).toBeNull();
    expect(listPasskeys).toHaveBeenCalledOnce();
  });

  it('says when this device already has one', async () => {
    listAnswers([PHONE]);
    vi.mocked(registerPasskey).mockResolvedValueOnce({
      error: ceremonyError('ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED'),
    });
    const user = renderSetting();

    await user.click(screen.getByRole('button', { name: 'Save fingerprint' }));

    expect(await screen.findByTestId('toast')).toHaveTextContent(
      'This device already has a fingerprint saved for your account.',
    );
  });

  it('reports any other failure to save', async () => {
    listAnswers([]);
    const error = ceremonyError('webauthn_verification_failed');
    vi.mocked(registerPasskey).mockResolvedValueOnce({ error });
    const user = renderSetting();

    await user.click(screen.getByRole('button', { name: 'Save fingerprint' }));

    expect(await screen.findByTestId('toast')).toHaveTextContent(
      'Could not save the fingerprint. Please try again.',
    );
    expect(console.error).toHaveBeenCalledWith('passkey registration', error);
  });

  it('holds both buttons while saving', async () => {
    listAnswers([PHONE]);
    vi.mocked(registerPasskey).mockReturnValueOnce(new Promise(() => {}));
    const user = renderSetting();
    const remove = await screen.findByTestId('passkey-remove');

    await user.click(screen.getByRole('button', { name: 'Save fingerprint' }));

    expect(
      screen.getByRole('button', { name: 'Save fingerprint' }),
    ).toBeDisabled();
    expect(remove).toBeDisabled();
  });

  it('removes a passkey, confirms it and drops it from the list', async () => {
    listAnswers([PHONE, UNNAMED], [UNNAMED]);
    vi.mocked(deletePasskey).mockResolvedValueOnce({ error: null });
    const user = renderSetting();
    const phone = (await screen.findAllByTestId('passkey'))[0];

    await user.click(
      within(phone).getByRole('button', {
        name: 'Remove Google Password Manager',
      }),
    );

    expect(deletePasskey).toHaveBeenCalledWith('passkey-phone');
    expect(await screen.findByTestId('toast')).toHaveTextContent(
      'Fingerprint sign-in removed.',
    );
    await waitFor(() =>
      expect(screen.getAllByTestId('passkey')).toHaveLength(1),
    );
  });

  it('reports a failed removal and keeps the list as it was', async () => {
    listAnswers([PHONE]);
    const error = new Error('offline');
    vi.mocked(deletePasskey).mockResolvedValueOnce({ error });
    const user = renderSetting();

    await user.click(await screen.findByTestId('passkey-remove'));

    expect(await screen.findByTestId('toast')).toHaveTextContent(
      'Removing failed. Please try again.',
    );
    expect(console.error).toHaveBeenCalledWith('passkey removal', error);
    expect(listPasskeys).toHaveBeenCalledOnce();
    expect(screen.getByTestId('passkey-remove')).not.toBeDisabled();
  });

  it('still lists, and lets a lost device go, where this browser cannot save one', async () => {
    vi.stubGlobal('PublicKeyCredential', undefined);
    listAnswers([PHONE]);
    renderSetting();

    expect(await screen.findByTestId('passkey-remove')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Save fingerprint' }),
    ).toBeNull();
  });
});
