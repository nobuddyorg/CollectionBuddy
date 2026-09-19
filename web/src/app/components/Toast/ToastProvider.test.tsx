// @vitest-environment jsdom
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

function SuccessTrigger({ message }: { message: string }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.success(message)}>
      {message}
    </button>
  );
}

function ErrorTrigger({ message }: { message: string }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.error(message)}>
      {message}
    </button>
  );
}

function UndoableSuccessTrigger({
  message,
  onExpire,
  onUndo,
}: {
  message: string;
  onExpire: () => void;
  onUndo: () => void;
}) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() =>
        toast.success(message, {
          action: { label: 'Undo', onClick: onUndo },
          onExpire,
        })
      }
    >
      {message}
    </button>
  );
}

function ReportErrorTrigger({
  message,
  error,
}: {
  message: string;
  error: unknown;
}) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => toast.reportError('trigger', error, message)}
    >
      {message}
    </button>
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

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws when used outside a ToastProvider', () => {
    expect(() => renderHook(() => useToast())).toThrow(
      'useToast must be used within a ToastProvider',
    );
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

  it('posts a success toast as a visible, polite status rather than an assertive alert', async () => {
    render(
      <I18nProvider>
        <ToastProvider>
          <SuccessTrigger message="Category deleted." />
        </ToastProvider>
      </I18nProvider>,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Category deleted.' }),
    );

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Category deleted.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reportError posts an assertive alert and logs the scope and error', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const err = new Error('boom');
    render(
      <I18nProvider>
        <ToastProvider>
          <ReportErrorTrigger
            message="Could not save this entry."
            error={err}
          />
        </ToastProvider>
      </I18nProvider>,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Could not save this entry.' }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not save this entry.');
    expect(consoleError).toHaveBeenCalledWith('trigger', err);
    consoleError.mockRestore();
  });

  it('error() posts an assertive alert on its own, without going through reportError', async () => {
    render(
      <I18nProvider>
        <ToastProvider>
          <ErrorTrigger message="Could not load collections." />
        </ToastProvider>
      </I18nProvider>,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Could not load collections.' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load collections.',
    );
  });

  it('dismissing a toast from its own close button still commits onExpire, same as auto-dismiss', async () => {
    const onExpire = vi.fn();
    render(
      <I18nProvider>
        <ToastProvider>
          <UndoableSuccessTrigger
            message="Collection deleted."
            onExpire={onExpire}
            onUndo={vi.fn()}
          />
        </ToastProvider>
      </I18nProvider>,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Collection deleted.' }),
    );
    const status = await screen.findByRole('status');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(status).not.toBeInTheDocument();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses a toast on its own after the timeout, running onExpire', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onExpire = vi.fn();
    render(
      <I18nProvider>
        <ToastProvider>
          <UndoableSuccessTrigger
            message="Collection deleted."
            onExpire={onExpire}
            onUndo={vi.fn()}
          />
        </ToastProvider>
      </I18nProvider>,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Collection deleted.' }),
    );
    expect(screen.getByRole('status')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(onExpire).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("runs the action's own onClick and skips onExpire when its undo is used", async () => {
    const onExpire = vi.fn();
    const onUndo = vi.fn();
    render(
      <I18nProvider>
        <ToastProvider>
          <UndoableSuccessTrigger
            message="Collection deleted."
            onExpire={onExpire}
            onUndo={onUndo}
          />
        </ToastProvider>
      </I18nProvider>,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Collection deleted.' }),
    );
    const status = await screen.findByRole('status');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();
    expect(status).not.toBeInTheDocument();
  });
});
