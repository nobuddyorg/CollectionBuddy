// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ConfirmProvider } from '../Confirm/ConfirmProvider';
import { ToastProvider } from '../Toast/ToastProvider';
import { SharingSection } from './Sharing';
import type { UseShares } from './useShares';

function sharesState(overrides: Partial<UseShares> = {}): UseShares {
  return {
    shares: [],
    isLoading: false,
    isSharing: false,
    isRevoking: false,
    isUpdatingRole: false,
    reload: vi.fn().mockResolvedValue([]),
    createShare: vi.fn().mockResolvedValue(true),
    revokeShare: vi.fn().mockResolvedValue(undefined),
    leaveShare: vi.fn().mockResolvedValue(true),
    updateShareRole: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function renderSection(shares: UseShares) {
  render(
    <I18nProvider>
      <ToastProvider>
        <ConfirmProvider>
          <SharingSection shares={shares} />
        </ConfirmProvider>
      </ToastProvider>
    </I18nProvider>,
  );
}

describe('SharingSection invite', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
  });

  it('says nothing is shared yet when the list is empty', () => {
    renderSection(sharesState());
    expect(screen.getByText('Not shared with anyone yet.')).toBeVisible();
  });

  it('stops the email at 320 characters, as the database does', () => {
    renderSection(sharesState());
    expect(screen.getByLabelText('Share with (email)')).toHaveAttribute(
      'maxlength',
      '320',
    );
  });

  it('shares with the trimmed email and no expiry when none is picked', async () => {
    const createShare = vi.fn().mockResolvedValue(true);
    renderSection(sharesState({ createShare }));

    await userEvent.type(
      screen.getByLabelText('Share with (email)'),
      '  grantee@example.com  ',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));

    expect(createShare).toHaveBeenCalledWith('grantee@example.com', null);
  });

  it("converts a picked date to that day's end rather than its start", async () => {
    const createShare = vi.fn().mockResolvedValue(true);
    renderSection(sharesState({ createShare }));

    await userEvent.type(
      screen.getByLabelText('Share with (email)'),
      'grantee@example.com',
    );
    // userEvent.type does not reliably fill a jsdom date input; fireEvent.change does.
    fireEvent.change(screen.getByLabelText('Expires (optional)'), {
      target: { value: '2026-08-20' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));

    expect(createShare).toHaveBeenCalledWith(
      'grantee@example.com',
      new Date('2026-08-20T23:59:59').toISOString(),
    );
  });

  it('shares on pressing Enter in the email field', async () => {
    const createShare = vi.fn().mockResolvedValue(true);
    renderSection(sharesState({ createShare }));

    const emailField = screen.getByLabelText('Share with (email)');
    await userEvent.type(emailField, 'grantee@example.com{Enter}');

    expect(createShare).toHaveBeenCalledWith('grantee@example.com', null);
  });

  it('does nothing on Enter while the email field is empty', async () => {
    const createShare = vi.fn().mockResolvedValue(true);
    renderSection(sharesState({ createShare }));

    await userEvent.type(
      screen.getByLabelText('Share with (email)'),
      '{Enter}',
    );

    expect(createShare).not.toHaveBeenCalled();
  });

  it('does nothing on Enter while a share is already in flight', async () => {
    const createShare = vi.fn().mockResolvedValue(true);
    renderSection(sharesState({ createShare, isSharing: true }));

    await userEvent.type(
      screen.getByLabelText('Share with (email)'),
      'grantee@example.com{Enter}',
    );

    expect(createShare).not.toHaveBeenCalled();
  });

  it('shows a spinner instead of the share icon while sharing is in flight', () => {
    renderSection(sharesState({ isSharing: true }));
    expect(screen.getByRole('button', { name: 'Share' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('keeps the entered email and date when sharing fails', async () => {
    const createShare = vi.fn().mockResolvedValue(false);
    renderSection(sharesState({ createShare }));

    await userEvent.type(
      screen.getByLabelText('Share with (email)'),
      'grantee@example.com',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));

    expect(
      await screen.findByDisplayValue('grantee@example.com'),
    ).toBeInTheDocument();
  });

  it('disables Share until an email is entered', () => {
    renderSection(sharesState());
    expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled();
  });

  it('shows "No expiry" until a date is picked, with no clear button', () => {
    renderSection(sharesState());
    expect(screen.getByText('No expiry')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Clear expiry date' }),
    ).not.toBeInTheDocument();
  });

  // jsdom has no showPicker, so the trigger falls back to focusing the sr-only date input.
  it('focuses the date field when its trigger button is clicked', async () => {
    renderSection(sharesState());
    await userEvent.click(screen.getByTitle('Expires (optional)'));
    expect(screen.getByLabelText('Expires (optional)')).toHaveFocus();
  });

  // The button is the whole picking interface, so where a picker exists it must open it.
  it('opens the native picker on a browser that has one', async () => {
    const showPicker = vi.fn();
    const original = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'showPicker',
    );
    Object.defineProperty(HTMLInputElement.prototype, 'showPicker', {
      value: showPicker,
      configurable: true,
      writable: true,
    });
    try {
      renderSection(sharesState());
      await userEvent.click(screen.getByTitle('Expires (optional)'));

      expect(showPicker).toHaveBeenCalled();
      expect(screen.getByLabelText('Expires (optional)')).not.toHaveFocus();
    } finally {
      if (original) {
        Object.defineProperty(
          HTMLInputElement.prototype,
          'showPicker',
          original,
        );
      } else {
        delete (HTMLInputElement.prototype as { showPicker?: unknown })
          .showPicker;
      }
    }
  });

  it('shows the picked date and clears it back to "No expiry"', async () => {
    renderSection(sharesState());
    fireEvent.change(screen.getByLabelText('Expires (optional)'), {
      target: { value: '2026-08-20' },
    });

    const expected = `Expires ${new Date('2026-08-20T00:00:00').toLocaleDateString()}`;
    expect(screen.getByText(expected)).toBeVisible();

    await userEvent.click(
      screen.getByRole('button', { name: 'Clear expiry date' }),
    );

    expect(screen.getByText('No expiry')).toBeVisible();
    expect(screen.getByLabelText('Expires (optional)')).toHaveValue('');
  });
});

describe('SharingSection list', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
  });

  it('lists an existing grant with its expiry', () => {
    const expiresAt = '2026-12-31T23:59:59.000Z';
    renderSection(
      sharesState({
        shares: [
          {
            id: 'share-1',
            invited_email: 'grantee@example.com',
            expires_at: expiresAt,
            owner_user_id: 'owner-1',
            role: 'viewer',
          },
        ],
      }),
    );
    // The expiry sits in a nested span, so aggregate text is read rather than one node's.
    const row = screen.getByText('grantee@example.com').closest('li')!;
    expect(row).toHaveTextContent(
      `Expires ${new Date(expiresAt).toLocaleDateString()}`,
    );
  });

  it('marks a lapsed grant as expired, in red, rather than showing a past "Expires" date', () => {
    const expiresAt = '2020-01-01T00:00:00.000Z';
    renderSection(
      sharesState({
        shares: [
          {
            id: 'share-1',
            invited_email: 'grantee@example.com',
            expires_at: expiresAt,
            owner_user_id: 'owner-1',
            role: 'viewer',
          },
        ],
      }),
    );
    const row = screen.getByText('grantee@example.com').closest('li')!;
    expect(row).toHaveTextContent(
      `Expired ${new Date(expiresAt).toLocaleDateString()}`,
    );
    const expirySpan = row.querySelector('.text-destructive');
    expect(expirySpan).not.toBeNull();
    expect(expirySpan).toHaveTextContent('Expired');
  });

  it("reflects an existing grant's role in its checkbox", () => {
    renderSection(
      sharesState({
        shares: [
          {
            id: 'share-1',
            invited_email: 'grantee@example.com',
            expires_at: null,
            owner_user_id: 'owner-1',
            role: 'editor',
          },
        ],
      }),
    );
    const row = screen.getByText('grantee@example.com').closest('li')!;
    expect(within(row).getByLabelText('Can edit')).toBeChecked();
  });

  it('warns before granting edit access, and only applies it once accepted', async () => {
    const updateShareRole = vi.fn().mockResolvedValue(true);
    renderSection(
      sharesState({
        shares: [
          {
            id: 'share-1',
            invited_email: 'grantee@example.com',
            expires_at: null,
            owner_user_id: 'owner-1',
            role: 'viewer',
          },
        ],
        updateShareRole,
      }),
    );

    await userEvent.click(screen.getByLabelText('Can edit'));
    expect(updateShareRole).not.toHaveBeenCalled();

    expect(
      await screen.findByText(
        'Give grantee@example.com full edit access to this collection, including adding, changing and deleting entries and photographs?',
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByTestId('confirm-accept'));

    expect(updateShareRole).toHaveBeenCalledWith('share-1', 'editor');
  });

  it('does not grant edit access if the warning is declined', async () => {
    const updateShareRole = vi.fn().mockResolvedValue(true);
    renderSection(
      sharesState({
        shares: [
          {
            id: 'share-1',
            invited_email: 'grantee@example.com',
            expires_at: null,
            owner_user_id: 'owner-1',
            role: 'viewer',
          },
        ],
        updateShareRole,
      }),
    );

    await userEvent.click(screen.getByLabelText('Can edit'));
    await screen.findByTestId('confirm-cancel');
    await userEvent.click(screen.getByTestId('confirm-cancel'));

    expect(updateShareRole).not.toHaveBeenCalled();
  });

  it('revokes edit access with no warning', async () => {
    const updateShareRole = vi.fn().mockResolvedValue(true);
    renderSection(
      sharesState({
        shares: [
          {
            id: 'share-1',
            invited_email: 'grantee@example.com',
            expires_at: null,
            owner_user_id: 'owner-1',
            role: 'editor',
          },
        ],
        updateShareRole,
      }),
    );

    await userEvent.click(screen.getByLabelText('Can edit'));

    expect(updateShareRole).toHaveBeenCalledWith('share-1', 'viewer');
  });

  // "Can edit" has no room on a narrow screen; the pen icon opens the same checkbox in a modal.
  it('opens the role toggle in a modal from the mobile pen button', async () => {
    const updateShareRole = vi.fn().mockResolvedValue(true);
    renderSection(
      sharesState({
        shares: [
          {
            id: 'share-1',
            invited_email: 'grantee@example.com',
            expires_at: null,
            owner_user_id: 'owner-1',
            role: 'viewer',
          },
        ],
        updateShareRole,
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Edit access' }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('grantee@example.com')).toBeVisible();
    await userEvent.click(within(dialog).getByLabelText('Can edit'));

    expect(
      await screen.findByText(
        'Give grantee@example.com full edit access to this collection, including adding, changing and deleting entries and photographs?',
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByTestId('confirm-accept'));

    expect(updateShareRole).toHaveBeenCalledWith('share-1', 'editor');
  });

  it('closes the role modal again, leaving the row as it was', async () => {
    const updateShareRole = vi.fn().mockResolvedValue(true);
    renderSection(
      sharesState({
        shares: [
          {
            id: 'share-1',
            invited_email: 'grantee@example.com',
            expires_at: null,
            owner_user_id: 'owner-1',
            role: 'viewer',
          },
        ],
        updateShareRole,
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Edit access' }));
    const dialog = screen.getByRole('dialog');
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Close' }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(updateShareRole).not.toHaveBeenCalled();
  });

  it('revokes only after the confirmation is accepted', async () => {
    const revokeShare = vi.fn<UseShares['revokeShare']>();
    renderSection(
      sharesState({
        shares: [
          {
            id: 'share-1',
            invited_email: 'grantee@example.com',
            expires_at: null,
            owner_user_id: 'owner-1',
            role: 'viewer',
          },
        ],
        revokeShare,
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(revokeShare).not.toHaveBeenCalled();

    expect(
      await screen.findByText(
        'Stop sharing with grantee@example.com? They will no longer be able to see this collection.',
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByTestId('confirm-accept'));

    expect(revokeShare).toHaveBeenCalledWith('share-1');
  });

  it('does not revoke when the confirmation is declined', async () => {
    const revokeShare = vi.fn<UseShares['revokeShare']>();
    renderSection(
      sharesState({
        shares: [
          {
            id: 'share-1',
            invited_email: 'grantee@example.com',
            expires_at: null,
            owner_user_id: 'owner-1',
            role: 'viewer',
          },
        ],
        revokeShare,
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await screen.findByTestId('confirm-cancel');
    await userEvent.click(screen.getByTestId('confirm-cancel'));

    expect(revokeShare).not.toHaveBeenCalled();
  });

  // A row clicked mid-reload may be gone, or changed, by the time the action reaches the server.
  it('offers no row action while the list is reloading', () => {
    renderSection(
      sharesState({
        isLoading: true,
        shares: [
          {
            id: 'share-1',
            invited_email: 'grantee@example.com',
            expires_at: null,
            owner_user_id: 'owner-1',
            role: 'viewer',
          },
        ],
      }),
    );

    expect(screen.getByRole('button', { name: 'Revoke' })).toBeDisabled();
    expect(screen.getByLabelText('Can edit')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit access' })).toBeDisabled();
  });
});
