// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import Header from './index';

function renderHeader() {
  return render(
    <I18nProvider>
      <Header user={{ email: 'collector@example.com' }} onSignOut={vi.fn()} />
    </I18nProvider>,
  );
}

describe('Header', () => {
  // Same mark as the login page: an ink rule under "Collection", the accent on "Buddy".
  it('renders the wordmark in two parts', () => {
    renderHeader();
    expect(screen.getByText('Collection')).toBeVisible();
    expect(screen.getByText('Buddy')).toBeVisible();
  });

  it('underscores "Collection" and puts the accent on "Buddy"', () => {
    renderHeader();
    expect(screen.getByText('Collection').className).toContain('border-b-2');
    expect(screen.getByText('Buddy').className).toContain('text-accent');
  });

  it('shows the signed-in address', () => {
    renderHeader();
    expect(screen.getByText('collector@example.com')).toBeVisible();
  });

  // The email span is max-sm:hidden, so without aria-label the name collapses to "▾" on phones.
  it('names the account menu button for assistive tech', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeVisible();
  });

  describe('with a configured base path', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('prefixes the logo image with the configured base path', () => {
      vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/collectionbuddy');
      const { container } = renderHeader();
      expect(container.querySelector('img')).toHaveAttribute(
        'src',
        '/collectionbuddy/logo-header.png',
      );
    });
  });

  it('falls back to the app name for the title when there is no email to show', () => {
    render(
      <I18nProvider>
        <Header user={{ email: '' }} onSignOut={vi.fn()} />
      </I18nProvider>,
    );
    expect(
      screen.getByRole('button', { name: 'Account menu' }),
    ).toHaveAttribute('title', 'CollectionBuddy');
  });
});
