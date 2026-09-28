// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import Header from './index';

// jsdom keeps localStorage across a file's tests; reset so each starts from the detected language.
beforeEach(() => {
  localStorage.clear();
});

function renderHeader(
  onSignOut = vi.fn(),
  onOpenHelp = vi.fn(),
  onDeleteAccount = vi.fn(),
) {
  const rendered = render(
    <I18nProvider>
      <Header
        user={{ email: 'collector@example.com' }}
        onSignOut={onSignOut}
        onDeleteAccount={onDeleteAccount}
        onOpenHelp={onOpenHelp}
      />
    </I18nProvider>,
  );
  return { ...rendered, onSignOut, onOpenHelp, onDeleteAccount };
}

async function openMenu() {
  const user = userEvent.setup();
  const rendered = renderHeader();
  await user.click(screen.getByRole('button', { name: 'Account menu' }));
  return { user, ...rendered };
}

describe('Menu', () => {
  it('offers background removal, off by default', async () => {
    await openMenu();

    expect(
      screen.getByRole('checkbox', { name: 'Remove backgrounds' }),
    ).not.toBeChecked();
  });

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
    // jsdom's navigator.language is 'en-US', so pickLanguage() lands on 'en'.
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

  it('links the privacy notice, closing the menu on the way', async () => {
    const { user } = await openMenu();
    const menu = document.getElementById('user-menu') as HTMLElement;
    const link = within(menu).getByRole('link', { name: 'Privacy notice' });
    // next.config.ts's trailingSlash adds the slash in a build.
    expect(link).toHaveAttribute('href', '/privacy');
    // jsdom cannot navigate; cancelled, the click still reaches the menu's handler.
    link.addEventListener('click', (event) => event.preventDefault());
    await user.click(link);
    expect(document.getElementById('user-menu')).toBeNull();
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

  it('opens help, closes the menu and leaves focus on the trigger for the dialog to return to', async () => {
    const onOpenHelp = vi.fn();
    const user = userEvent.setup();
    renderHeader(vi.fn(), onOpenHelp);
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    await user.click(trigger);
    const menu = document.getElementById('user-menu') as HTMLElement;
    await user.click(within(menu).getByRole('button', { name: 'Help' }));
    expect(onOpenHelp).toHaveBeenCalledTimes(1);
    expect(document.getElementById('user-menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('starts the account deletion, closes the menu and leaves focus on the trigger for the confirmation to return to', async () => {
    const onDeleteAccount = vi.fn();
    const user = userEvent.setup();
    renderHeader(vi.fn(), vi.fn(), onDeleteAccount);
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    await user.click(trigger);
    const menu = document.getElementById('user-menu') as HTMLElement;
    await user.click(
      within(menu).getByRole('button', { name: 'Delete account' }),
    );
    expect(onDeleteAccount).toHaveBeenCalledTimes(1);
    expect(document.getElementById('user-menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('names the help shortcut for assistive tech rather than in the button name', async () => {
    await openMenu();
    const menu = document.getElementById('user-menu') as HTMLElement;
    const help = within(menu).getByRole('button', { name: 'Help' });
    expect(help).toHaveAttribute('aria-keyshortcuts', 'Control+/ Meta+/');
    expect(within(help).getByText('Ctrl+/')).toBeVisible();
  });
});
