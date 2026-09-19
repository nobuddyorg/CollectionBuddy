// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

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
  it('stops loading and reports the error when sign-in rejects', async () => {
    const onError = vi.fn();
    const error = new Error('popup blocked');
    render(
      <I18nProvider>
        <GoogleSignInButton
          onClick={() => Promise.reject(error)}
          onError={onError}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

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

  it('stops listening for pageshow once unmounted', async () => {
    const { unmount } = renderButton();
    fireEvent.click(screen.getByRole('button'));
    await screen.findByRole('status');

    unmount();

    expect(() => firePageShow(true)).not.toThrow();
  });

  it('leaves the overlay alone on an ordinary (non-persisted) pageshow', async () => {
    renderButton();
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('status')).toBeInTheDocument();

    firePageShow(false);

    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
