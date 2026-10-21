// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import PasskeySignInButton from './index';

function renderButton(onClick: () => Promise<unknown>, onError = vi.fn()) {
  render(
    <I18nProvider>
      <PasskeySignInButton onClick={onClick} onError={onError} />
    </I18nProvider>,
  );
  return { onError, button: screen.getByRole('button') };
}

describe('PasskeySignInButton', () => {
  it('names itself after the fingerprint', () => {
    const { button } = renderButton(() => Promise.resolve());
    expect(button).toHaveAccessibleName('Sign in with fingerprint');
  });

  it('is busy while the prompt is open', () => {
    const { button } = renderButton(() => new Promise(() => {}));
    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('is ready again once a dismissed prompt resolves, with nothing reported', async () => {
    const { button, onError } = renderButton(() => Promise.resolve());
    fireEvent.click(button);
    await waitFor(() => expect(button).not.toBeDisabled());
    expect(button).toHaveAttribute('aria-busy', 'false');
    expect(onError).not.toHaveBeenCalled();
  });

  it('reports a failed sign-in and is ready again', async () => {
    const error = new Error('not registered');
    const { button, onError } = renderButton(() => Promise.reject(error));
    fireEvent.click(button);
    await waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(button).not.toBeDisabled();
  });
});
