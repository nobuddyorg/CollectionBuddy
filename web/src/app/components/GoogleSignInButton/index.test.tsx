// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import GoogleSignInButton from './index';

function renderButton(
  props: Partial<React.ComponentProps<typeof GoogleSignInButton>> = {},
) {
  return render(
    <I18nProvider>
      <GoogleSignInButton onClick={() => new Promise(() => {})} {...props} />
    </I18nProvider>,
  );
}

function firePageShow(persisted: boolean) {
  const event = new Event('pageshow') as PageTransitionEvent;
  Object.defineProperty(event, 'persisted', { value: persisted });
  void act(() => window.dispatchEvent(event));
}

describe('GoogleSignInButton', () => {
  // Regression (#350): `mode: 'oauth'` never clears `loading` itself, relying
  // on the redirect to unmount the page. A bfcache restore resurrects that
  // stale `loading: true` with no redirect coming -- the full-screen overlay
  // would otherwise be stuck with no way to dismiss it.
  it('drops a stuck overlay once the page is restored from bfcache', async () => {
    renderButton();
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('status')).toBeInTheDocument();

    firePageShow(true);

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('leaves the overlay alone on an ordinary (non-persisted) pageshow', async () => {
    renderButton();
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('status')).toBeInTheDocument();

    firePageShow(false);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
