// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import Header from './index';

// Language/theme choices persist to localStorage, which jsdom keeps across
// tests in this file -- reset it so each test starts from the same
// detected-language state.
beforeEach(() => {
  localStorage.clear();
});

function renderHeader(onSignOut = vi.fn()) {
  const utils = render(
    <I18nProvider>
      <Header user={{ email: 'collector@example.com' }} onSignOut={onSignOut} />
    </I18nProvider>,
  );
  return { ...utils, onSignOut };
}

async function openMenu() {
  const user = userEvent.setup();
  const utils = renderHeader();
  await user.click(screen.getByRole('button', { name: 'Account menu' }));
  return { user, ...utils };
}

describe('Menu', () => {
  it('is closed until the account menu button is clicked', () => {
    renderHeader();
    expect(
      screen.queryByText('collector@example.com', { selector: 'div' }),
    ).toBeNull();
  });

  it('shows the signed-in address and language/theme controls once opened', async () => {
    await openMenu();
    const menu = document.getElementById('user-menu') as HTMLElement;
    expect(within(menu).getByText('collector@example.com')).toBeVisible();
    expect(within(menu).getByRole('button', { name: 'Deutsch' })).toBeVisible();
    expect(within(menu).getByRole('button', { name: 'English' })).toBeVisible();
  });

  it('marks the active language as pressed', async () => {
    await openMenu();
    const menu = document.getElementById('user-menu') as HTMLElement;
    // jsdom's navigator.language is 'en-US', so detectLang() lands on 'en'.
    expect(
      within(menu).getByRole('button', { name: 'English' }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(
      within(menu).getByRole('button', { name: 'Deutsch' }),
    ).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches language when a segment is clicked', async () => {
    const { user } = await openMenu();
    const menu = document.getElementById('user-menu') as HTMLElement;
    await user.click(within(menu).getByRole('button', { name: 'Deutsch' }));
    expect(
      within(menu).getByRole('button', { name: 'Deutsch' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches theme preference when a segment is clicked', async () => {
    const { user } = await openMenu();
    const menu = document.getElementById('user-menu') as HTMLElement;
    const dark = within(menu)
      .getAllByRole('button')
      .find((b) =>
        ['Dark', 'Dunkel'].includes(b.textContent ?? ''),
      ) as HTMLElement;
    await user.click(dark);
    expect(dark).toHaveAttribute('aria-pressed', 'true');
  });

  it('signs out and closes the menu when sign out is clicked', async () => {
    const onSignOut = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderHeader(onSignOut);
    await user.click(screen.getByRole('button', { name: 'Account menu' }));
    const menu = document.getElementById('user-menu') as HTMLElement;
    const signOut = within(menu).getByRole('button', {
      name: /sign out|abmelden/i,
    });
    await user.click(signOut);
    expect(onSignOut).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(document.getElementById('user-menu')).toBeNull();
    });
  });
});
