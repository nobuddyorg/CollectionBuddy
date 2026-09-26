// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AppError from './error';
import { I18nProvider } from './i18n/I18nProvider';

const LAST_RELOAD_KEY = 'stale-build-reload-at';

function chunkLoadError() {
  const error = new Error('Failed to load chunk /_next/static/chunks/a.js');
  error.name = 'ChunkLoadError';
  return error;
}

function renderBoundary(error: Error) {
  return render(
    <I18nProvider>
      <AppError error={error} />
    </I18nProvider>,
  );
}

describe('AppError', () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    window.sessionStorage.clear();
    reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(1_000_000);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('reloads once when a chunk a deploy removed fails to load, and remembers when', () => {
    renderBoundary(chunkLoadError());

    expect(reload).toHaveBeenCalledOnce();
    expect(window.sessionStorage.getItem(LAST_RELOAD_KEY)).toBe('1000000');
  });

  it('shows the translated error screen instead of reloading again right after a reload', () => {
    window.sessionStorage.setItem(LAST_RELOAD_KEY, String(1_000_000 - 1000));

    renderBoundary(chunkLoadError());

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('does not reload by itself for any other error', () => {
    renderBoundary(new TypeError('x is undefined'));

    expect(reload).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(LAST_RELOAD_KEY)).toBeNull();
    expect(
      screen.getByText(
        'This page could not be shown. Reloading loads the current version of the app.',
      ),
    ).toBeVisible();
  });

  it('reloads when asked to', async () => {
    renderBoundary(new TypeError('x is undefined'));

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

    expect(reload).toHaveBeenCalledOnce();
  });

  it('speaks German by default', () => {
    window.localStorage.removeItem('lang');
    vi.stubGlobal('navigator', { ...navigator, language: 'de-DE' });

    renderBoundary(new TypeError('x is undefined'));

    expect(
      screen.getByRole('heading', { name: 'Das hat nicht geklappt' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Neu laden' })).toBeVisible();
  });
});
