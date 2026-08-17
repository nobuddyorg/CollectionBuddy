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
    deleteShare: vi.fn().mockResolvedValue(true),
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

describe('SharingSection', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
  });

  it('says nothing is shared yet when the list is empty', () => {
    renderSection(sharesState());
    expect(screen.getByText('Not shared with anyone yet.')).toBeVisible();
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
    // userEvent.type doesn't reliably fill a date input across jsdom
    // versions; fireEvent.change with a `yyyy-mm-dd` value is the input's
    // own documented API and goes through React's onChange correctly,
    // unlike setting .value and dispatching a bare native event.
    fireEvent.change(screen.getByLabelText('Expires (optional)'), {
      target: { value: '2026-08-20' },
    });
    await userEvent.click(screen.getByRole('button', { name: 'Share' }));

    expect(createShare).toHaveBeenCalledWith(
      'grantee@example.com',
      new Date('2026-08-20T23:59:59').toISOString(),
    );
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

  // jsdom has no `showPicker`, so the trigger button falls back to
  // focusing the underlying (sr-only) date input -- the same thing a
  // plain click on that field does natively where `showPicker` is
  // unsupported (older Safari/Firefox).
  it('focuses the date field when its trigger button is clicked', async () => {
    renderSection(sharesState());
    await userEvent.click(screen.getByTitle('Expires (optional)'));
    expect(screen.getByLabelText('Expires (optional)')).toHaveFocus();
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
    // The dash and the expiry sit in a nested span (see Sharing.tsx), so
    // the full line is split across elements -- toHaveTextContent reads
    // an element's aggregate text rather than requiring one node whose
    // entire content matches exactly, the way getByText's default would.
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

  it('revokes only after the confirmation is accepted', async () => {
    const deleteShare = vi.fn().mockResolvedValue(true);
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
        deleteShare,
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(deleteShare).not.toHaveBeenCalled();

    expect(
      await screen.findByText(
        'Stop sharing with grantee@example.com? They will no longer be able to see this collection.',
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByTestId('confirm-accept'));

    expect(deleteShare).toHaveBeenCalledWith('share-1');
  });
});
