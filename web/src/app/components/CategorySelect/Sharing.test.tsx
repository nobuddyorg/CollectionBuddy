// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
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
    reload: vi.fn().mockResolvedValue([]),
    createShare: vi.fn().mockResolvedValue(true),
    deleteShare: vi.fn().mockResolvedValue(true),
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
          },
        ],
        deleteShare,
      }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(deleteShare).not.toHaveBeenCalled();

    expect(
      await screen.findByText(
        'Stop sharing with grantee@example.com? They will no longer be able to see this category.',
      ),
    ).toBeVisible();
    await userEvent.click(screen.getByTestId('confirm-accept'));

    expect(deleteShare).toHaveBeenCalledWith('share-1');
  });
});
