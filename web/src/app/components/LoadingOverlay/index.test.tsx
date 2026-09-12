// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import LoadingOverlay from './index';

function renderOverlay(props: Partial<Parameters<typeof LoadingOverlay>[0]>) {
  return render(
    <I18nProvider>
      <LoadingOverlay label="Loading the catalogue…" {...props} />
    </I18nProvider>,
  );
}

describe('LoadingOverlay', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('announces what is being waited for', () => {
    renderOverlay({});

    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading the catalogue…')).toBeVisible();
  });

  it('admits it is taking a while once the wait gets long', async () => {
    renderOverlay({});
    expect(screen.queryByText(/taking longer/i)).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    expect(screen.getByText(/taking longer/i)).toBeVisible();
  });

  it('starts the clock again when the wait becomes a different one', async () => {
    const { rerender } = renderOverlay({});
    await act(async () => {
      await vi.advanceTimersByTimeAsync(8000);
    });

    rerender(
      <I18nProvider>
        <LoadingOverlay label="Signing you in…" />
      </I18nProvider>,
    );

    expect(screen.queryByText(/taking longer/i)).not.toBeInTheDocument();
  });

  it('draws on the app palette when it is the only thing on screen', () => {
    renderOverlay({ theme: 'auto' });

    expect(screen.getByRole('status').className).toContain('bg-background/80');
  });
});
