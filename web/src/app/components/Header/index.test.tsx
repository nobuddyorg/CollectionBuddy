// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
  // The wordmark is the same mark as the login page's, so the two halves
  // have to stay separately styled: an ink rule under "Collection", the
  // accent on "Buddy".
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

  // The email span is `max-sm:hidden` and the caret carries no text, so
  // without an explicit label the button's accessible name would collapse
  // to "▾" on narrow viewports (#297). aria-label keeps it stable.
  it('names the account menu button for assistive tech', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: 'Account menu' })).toBeVisible();
  });
});
