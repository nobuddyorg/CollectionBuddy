// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UseShares } from './useShares';
import { renderSection, sharesState } from './Sharing.test-support';

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
    const deleteShare = vi.fn<UseShares['deleteShare']>();
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

    expect(deleteShare).toHaveBeenCalledWith(
      'share-1',
      expect.objectContaining({
        successMessage: 'Sharing revoked.',
        errorMessage: 'Could not revoke this share. Please try again.',
      }),
    );
  });

  it('does not revoke when the confirmation is declined', async () => {
    const deleteShare = vi.fn<UseShares['deleteShare']>();
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
    await screen.findByTestId('confirm-cancel');
    await userEvent.click(screen.getByTestId('confirm-cancel'));

    expect(deleteShare).not.toHaveBeenCalled();
  });
});
