// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import LoadError from './index';

function renderLoadError({ busy = false, onRetry = vi.fn() } = {}) {
  render(
    <I18nProvider>
      <LoadError
        testId="entries-load-error"
        title="The entries could not be loaded"
        busy={busy}
        onRetry={onRetry}
      />
    </I18nProvider>,
  );
  return onRetry;
}

describe('LoadError', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
  });

  it('is a region named by its title that says nothing was lost', () => {
    renderLoadError();

    const region = screen.getByRole('region', {
      name: 'The entries could not be loaded',
    });
    expect(region).toHaveAttribute('data-testid', 'entries-load-error');
    expect(region).toHaveAttribute('aria-busy', 'false');
    expect(region).toHaveTextContent(/Nothing is lost/);
  });

  it('retries from a button the keyboard reaches', async () => {
    const onRetry = renderLoadError();

    await userEvent.tab();
    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(retry).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  // Enabled while busy, so the focused button keeps its focus through a retry that fails again.
  it('shows a retry in flight without disabling the button', () => {
    renderLoadError({ busy: true });

    expect(screen.getByRole('region')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeEnabled();
  });
});
