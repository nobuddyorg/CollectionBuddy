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

import { leavingIsHeld } from '../../lib/useBeforeUnloadGuard.test-support';
import { ToastWrapper } from '../providers.test-support';
import { useToast } from './ToastProvider';

// One button per message so a test fires one or several through userEvent, and so inside act().
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
  onExpire: () => void | Promise<void>;
  onUndo: () => void;
}) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => toast.success(message, { onUndo, onExpire })}
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

function CommitTrigger({ onCommitted }: { onCommitted: () => void }) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={() => void toast.commitPending().then(onCommitted)}
    >
      Commit
    </button>
  );
}

function renderWithToasts(ui: React.ReactNode) {
  return render(ui, { wrapper: ToastWrapper });
}

function renderUndoable(handlers: {
  onExpire: () => void | Promise<void>;
  onUndo?: () => void;
  onCommitted?: () => void;
}) {
  return renderWithToasts(
    <>
      <UndoableSuccessTrigger
        message="Entry deleted."
        onExpire={handlers.onExpire}
        onUndo={handlers.onUndo ?? vi.fn()}
      />
      <SuccessTrigger message="Entry added." />
      <CommitTrigger onCommitted={handlers.onCommitted ?? vi.fn()} />
    </>,
  );
}

function renderProvider(messages: string[]) {
  return renderWithToasts(<Trigger messages={messages} />);
}

const liveRegion = (container: HTMLElement) =>
  container.querySelector('[aria-live="polite"]');

describe('ToastProvider', () => {
  beforeEach(() => {
    // Pinned: I18nProvider otherwise falls back to jsdom's incidental navigator.language.
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

  it('shows a success toast and speaks it through the polite live region, never as an assertive alert', async () => {
    const { container } = renderWithToasts(
      <SuccessTrigger message="Category deleted." />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Category deleted.' }),
    );

    expect(screen.getByTestId('toast')).toHaveTextContent('Category deleted.');
    expect(liveRegion(container)).toHaveTextContent('Category deleted.');
    expect(screen.getByTestId('toast')).not.toHaveAttribute('aria-live');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('tells a screen reader how to undo, and marks the shortcut on the Undo button', async () => {
    const { container } = renderUndoable({ onExpire: vi.fn() });

    await userEvent.click(
      screen.getByRole('button', { name: 'Entry deleted.' }),
    );

    expect(liveRegion(container)).toHaveTextContent(
      'Entry deleted. Ctrl+Z undoes it.',
    );
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Control+Z Meta+Z',
    );
  });

  // Replacing the text inside one node is not reliably read out; inserting a new node is.
  it('announces the same message twice as a new node each time', async () => {
    const { container } = renderProvider(['Entry added.']);
    const button = screen.getByRole('button', { name: 'Entry added.' });

    await userEvent.click(button);
    const first = liveRegion(container)?.firstElementChild;
    await userEvent.click(button);

    expect(liveRegion(container)).toHaveTextContent('Entry added.');
    expect(liveRegion(container)?.firstElementChild).not.toBe(first);
  });

  it('reportError posts an assertive alert and logs the scope and error', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const error = new Error('boom');
    renderWithToasts(
      <ReportErrorTrigger message="Could not save this entry." error={error} />,
    );

    await userEvent.click(
      screen.getByRole('button', { name: 'Could not save this entry.' }),
    );

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not save this entry.');
    expect(consoleError).toHaveBeenCalledWith('trigger', error);
    consoleError.mockRestore();
  });

  it('error() posts an assertive alert on its own, without going through reportError', async () => {
    renderWithToasts(<ErrorTrigger message="Could not load collections." />);

    await userEvent.click(
      screen.getByRole('button', { name: 'Could not load collections.' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load collections.',
    );
  });

  it('dismissing a toast from its own close button still commits onExpire, same as auto-dismiss', async () => {
    const onExpire = vi.fn();
    renderUndoable({ onExpire });

    await userEvent.click(
      screen.getByRole('button', { name: 'Entry deleted.' }),
    );
    const status = await screen.findByTestId('toast');
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(status).not.toBeInTheDocument();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses a toast on its own after the timeout, running onExpire', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onExpire = vi.fn();
    renderUndoable({ onExpire });

    fireEvent.click(screen.getByRole('button', { name: 'Entry deleted.' }));
    expect(screen.getByTestId('toast')).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('runs onUndo instead of onExpire when Undo is used', async () => {
    const onExpire = vi.fn();
    const onUndo = vi.fn();
    renderUndoable({ onExpire, onUndo });

    await userEvent.click(
      screen.getByRole('button', { name: 'Entry deleted.' }),
    );
    const status = await screen.findByTestId('toast');
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();
    expect(status).not.toBeInTheDocument();
  });

  it('Undo cancels the commit for good: the window closing later runs nothing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onExpire = vi.fn();
    const onUndo = vi.fn();
    renderUndoable({ onExpire, onUndo });

    fireEvent.click(screen.getByRole('button', { name: 'Entry deleted.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });

    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('Close commits once: the window closing later does not run it again', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const onExpire = vi.fn();
    renderUndoable({ onExpire });

    fireEvent.click(screen.getByRole('button', { name: 'Entry deleted.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });

    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('commitPending after Close commits nothing a second time', async () => {
    const onExpire = vi.fn();
    const onCommitted = vi.fn();
    renderUndoable({ onExpire, onCommitted });

    await userEvent.click(
      screen.getByRole('button', { name: 'Entry deleted.' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await userEvent.click(screen.getByRole('button', { name: 'Commit' }));

    expect(onCommitted).toHaveBeenCalledTimes(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  // Sign-out calls this so a delete inside its undo window is sent while there is still a session.
  it('commitPending runs a pending onExpire once and resolves only after it has finished', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let finish = () => {};
    const onExpire = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const onCommitted = vi.fn();
    renderUndoable({ onExpire, onCommitted });

    fireEvent.click(screen.getByRole('button', { name: 'Entry deleted.' }));
    fireEvent.click(screen.getByRole('button', { name: 'Commit' }));

    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('toast')).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onCommitted).not.toHaveBeenCalled();

    await act(async () => {
      finish();
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(onCommitted).toHaveBeenCalledTimes(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  it('commitPending leaves an undone delete alone', async () => {
    const onExpire = vi.fn();
    const onCommitted = vi.fn();
    renderUndoable({ onExpire, onCommitted });

    await userEvent.click(
      screen.getByRole('button', { name: 'Entry deleted.' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    await userEvent.click(screen.getByRole('button', { name: 'Commit' }));

    expect(onCommitted).toHaveBeenCalledTimes(1);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('asks before the tab goes only while a delete is waiting out its undo window', async () => {
    renderUndoable({ onExpire: vi.fn() });

    await userEvent.click(screen.getByRole('button', { name: 'Entry added.' }));
    expect(leavingIsHeld()).toBe(false);

    await userEvent.click(
      screen.getByRole('button', { name: 'Entry deleted.' }),
    );
    expect(leavingIsHeld()).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(leavingIsHeld()).toBe(false);
  });
});
