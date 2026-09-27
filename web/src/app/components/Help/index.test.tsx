// @vitest-environment jsdom
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import HelpDialog from './index';

// jsdom keeps localStorage across a file's tests; reset so each starts from the detected language.
beforeEach(() => {
  localStorage.clear();
});

function renderHelp(open = true, onOpenChange = vi.fn()) {
  render(
    <I18nProvider>
      <HelpDialog open={open} onOpenChange={onOpenChange} />
    </I18nProvider>,
  );
  return { onOpenChange };
}

describe('HelpDialog', () => {
  it('renders nothing while closed', () => {
    renderHelp(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists every topic by title, each collapsed', () => {
    renderHelp();
    const dialog = screen.getByRole('dialog', { name: 'Help' });
    const titles = [
      'Collections',
      'Entries and photographs',
      'Search and map',
      'Sharing',
      'Import and export',
      'Undo and keyboard',
    ];
    for (const title of titles) {
      const topic = within(dialog).getByText(title).closest('details')!;
      expect(topic).not.toHaveAttribute('open');
    }
  });

  it('links the privacy notice, closing the help on the way', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderHelp();
    const link = screen.getByRole('link', { name: 'Privacy notice' });
    // next.config.ts's trailingSlash adds the slash in a build.
    expect(link).toHaveAttribute('href', '/privacy');
    // jsdom cannot navigate; cancelled, the click still reaches the dialog's handler.
    link.addEventListener('click', (event) => event.preventDefault());
    await user.click(link);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('shows a topic once its title is clicked', async () => {
    const user = userEvent.setup();
    renderHelp();
    await user.click(screen.getByText('Sharing'));
    expect(screen.getByTestId('help-topic-sharing')).toHaveAttribute('open');
    expect(screen.getByTestId('help-topic-sharing')).toHaveTextContent(
      'Can edit',
    );
  });

  it('asks to close from its close button', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderHelp();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('speaks German when the language is German', () => {
    localStorage.setItem('lang', 'de');
    renderHelp();
    expect(screen.getByRole('dialog', { name: 'Hilfe' })).toBeVisible();
    expect(screen.getByText('Rückgängig und Tastatur')).toBeVisible();
  });
});
