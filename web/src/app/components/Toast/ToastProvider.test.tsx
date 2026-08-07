// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider, useToast } from './ToastProvider';

// A minimal consumer, standing in for the real callers (useCreateItem,
// useItemMutations) that reach the provider only through useToast() -- never
// through its internals. Each message gets its own button so a test can
// fire one, or several in sequence, entirely through userEvent (and so
// entirely inside React's act()).
function Trigger({ messages }: { messages: string[] }) {
  const toast = useToast();
  return (
    <>
      {messages.map((message) => (
        <button
          key={message}
          type="button"
          onClick={() => toast.announce(message)}
        >
          {message}
        </button>
      ))}
    </>
  );
}

function renderProvider(messages: string[]) {
  return render(
    <I18nProvider>
      <ToastProvider>
        <Trigger messages={messages} />
      </ToastProvider>
    </I18nProvider>,
  );
}

const liveRegion = (container: HTMLElement) =>
  container.querySelector('[aria-live="polite"]');

describe('ToastProvider', () => {
  beforeEach(() => {
    // I18nProvider falls back to navigator.language ('en-US' in jsdom)
    // unless a stored preference says otherwise; pin it so this doesn't
    // depend on that incidental default.
    window.localStorage.setItem('lang', 'en');
  });

  it('starts the polite live region empty', () => {
    const { container } = renderProvider([]);
    expect(liveRegion(container)).toHaveTextContent('');
  });

  it('posts an announced outcome to the polite live region', async () => {
    const { container } = renderProvider(['Entry added.']);

    await userEvent.click(screen.getByRole('button', { name: 'Entry added.' }));

    expect(liveRegion(container)).toHaveTextContent('Entry added.');
  });

  it('replaces the previous announcement rather than accumulating them', async () => {
    const { container } = renderProvider(['Changes saved.', 'Entry deleted.']);

    await userEvent.click(
      screen.getByRole('button', { name: 'Changes saved.' }),
    );
    await userEvent.click(
      screen.getByRole('button', { name: 'Entry deleted.' }),
    );

    expect(liveRegion(container)).toHaveTextContent('Entry deleted.');
    expect(liveRegion(container)?.textContent).not.toContain('Changes saved');
  });

  it('keeps announcements separate from the assertive error toasts', async () => {
    const { container } = renderProvider(['Entry added.']);

    await userEvent.click(screen.getByRole('button', { name: 'Entry added.' }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(container.querySelectorAll('[aria-live="assertive"]')).toHaveLength(
      0,
    );
  });
});
