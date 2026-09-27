// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import GlobalError from './global-error';

describe('GlobalError', () => {
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.localStorage.clear();
    reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('speaks the language the visitor chose, on the document too', () => {
    window.localStorage.setItem('lang', 'en');

    render(<GlobalError />);

    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(document.documentElement.lang).toBe('en');
  });

  it('speaks German when nothing else decides', () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' });

    render(<GlobalError />);

    expect(
      screen.getByRole('heading', { name: 'Das hat nicht geklappt' }),
    ).toBeVisible();
    expect(document.documentElement.lang).toBe('de');
  });

  it('prerenders in German, as the root layout does', () => {
    window.localStorage.setItem('lang', 'en');

    const html = renderToString(<GlobalError />);

    expect(html).toContain('<html lang="de" data-theme="light">');
    expect(html).toContain('Das hat nicht geklappt');
  });

  it('still renders when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.stubGlobal('navigator', { language: 'en-GB' });

    render(<GlobalError />);

    expect(screen.getByRole('button', { name: 'Reload' })).toBeVisible();
  });

  it('takes the theme the visitor chose, as the root layout would', () => {
    window.localStorage.setItem('theme', 'dark');
    vi.stubGlobal('matchMedia', () => ({ matches: false }));

    render(<GlobalError />);

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it("follows the system's dark scheme when storage throws", () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    vi.stubGlobal('matchMedia', () => ({ matches: true }));

    render(<GlobalError />);

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('reloads when asked to', async () => {
    render(<GlobalError />);

    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));

    expect(reload).toHaveBeenCalledOnce();
  });
});
