// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../i18n/I18nProvider';
import { ToastProvider, useToast } from './ToastProvider';

type Deletion = { message: string; onExpire: () => void; onUndo: () => void };

// Covers WCAG 2.2.1: a keyboard or pointer user reaching Undo before the delete is sent.
function Triggers({ deletions }: { deletions: Deletion[] }) {
  const toast = useToast();
  return (
    <>
      {deletions.map(({ message, onExpire, onUndo }) => (
        <button
          key={message}
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
      ))}
      <button type="button" onClick={() => toast.success('Entry added.')}>
        Entry added.
      </button>
      <input aria-label="Title" />
    </>
  );
}

function deletion(message: string): Deletion {
  return { message, onExpire: vi.fn(), onUndo: vi.fn() };
}

function renderDeletions(...deletions: Deletion[]) {
  render(
    <I18nProvider>
      <ToastProvider>
        <Triggers deletions={deletions} />
      </ToastProvider>
    </I18nProvider>,
  );
}

const post = (message: string) =>
  fireEvent.click(screen.getByRole('button', { name: message }));

const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

const toast = () => screen.queryByTestId('toast');

const pressUndoShortcut = (target: Element = document.body) =>
  fireEvent.keyDown(target, { key: 'z', ctrlKey: true });

describe('ToastProvider: reaching Undo in time', () => {
  beforeEach(() => {
    window.localStorage.setItem('lang', 'en');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('holds its time while the pointer is over it, then runs on with what was left', () => {
    const entry = deletion('Entry deleted.');
    renderDeletions(entry);
    post('Entry deleted.');

    wait(4000);
    fireEvent.pointerEnter(toast()!);
    wait(20000);
    expect(toast()).toBeInTheDocument();

    fireEvent.pointerLeave(toast()!);
    wait(1999);
    expect(toast()).toBeInTheDocument();
    wait(1);
    expect(toast()).not.toBeInTheDocument();
    expect(entry.onExpire).toHaveBeenCalledTimes(1);
  });

  it('holds its time while focus is inside it', () => {
    const entry = deletion('Entry deleted.');
    renderDeletions(entry);
    post('Entry deleted.');

    wait(5000);
    act(() => screen.getByRole('button', { name: 'Undo' }).focus());
    wait(20000);
    expect(toast()).toBeInTheDocument();

    act(() => screen.getByRole('textbox').focus());
    wait(999);
    expect(toast()).toBeInTheDocument();
    wait(1);
    expect(toast()).not.toBeInTheDocument();
    expect(entry.onExpire).toHaveBeenCalledTimes(1);
  });

  it('stays held while focus moves from Undo to Close', () => {
    renderDeletions(deletion('Entry deleted.'));
    post('Entry deleted.');

    act(() => screen.getByRole('button', { name: 'Undo' }).focus());
    act(() => screen.getByRole('button', { name: 'Close' }).focus());
    wait(20000);

    expect(toast()).toBeInTheDocument();
  });

  it('stays held until neither the pointer nor focus holds it', () => {
    const entry = deletion('Entry deleted.');
    renderDeletions(entry);
    post('Entry deleted.');

    fireEvent.pointerEnter(toast()!);
    act(() => screen.getByRole('button', { name: 'Undo' }).focus());
    fireEvent.pointerLeave(toast()!);
    wait(20000);
    expect(toast()).toBeInTheDocument();

    act(() => screen.getByRole('button', { name: 'Undo' }).blur());
    wait(6000);
    expect(entry.onExpire).toHaveBeenCalledTimes(1);
  });

  it('does not restart its time when a pointer leaves a toast it never entered', () => {
    const entry = deletion('Entry deleted.');
    renderDeletions(entry);
    post('Entry deleted.');

    wait(4000);
    fireEvent.pointerLeave(toast()!);
    wait(2000);

    expect(toast()).not.toBeInTheDocument();
    expect(entry.onExpire).toHaveBeenCalledTimes(1);
  });

  it('commits nothing later when Undo is used while it held focus', () => {
    const entry = deletion('Entry deleted.');
    renderDeletions(entry);
    post('Entry deleted.');

    const undo = screen.getByRole('button', { name: 'Undo' });
    act(() => undo.focus());
    fireEvent.click(undo);
    wait(20000);

    expect(entry.onUndo).toHaveBeenCalledTimes(1);
    expect(entry.onExpire).not.toHaveBeenCalled();
  });

  it('Ctrl+Z undoes the newest toast that offers Undo, wherever focus is', () => {
    const first = deletion('Entry deleted.');
    const second = deletion('Photo deleted.');
    renderDeletions(first, second);
    post('Entry deleted.');
    post('Photo deleted.');
    post('Entry added.');

    expect(pressUndoShortcut()).toBe(false);
    expect(second.onUndo).toHaveBeenCalledTimes(1);
    expect(first.onUndo).not.toHaveBeenCalled();

    pressUndoShortcut();
    expect(first.onUndo).toHaveBeenCalledTimes(1);
    expect(screen.getAllByTestId('toast')).toHaveLength(1);
    wait(20000);
    expect(first.onExpire).not.toHaveBeenCalled();
    expect(second.onExpire).not.toHaveBeenCalled();
  });

  it('leaves Ctrl+Z inside a text field to undo the typing', () => {
    const entry = deletion('Entry deleted.');
    renderDeletions(entry);
    post('Entry deleted.');

    expect(pressUndoShortcut(screen.getByRole('textbox'))).toBe(true);
    expect(entry.onUndo).not.toHaveBeenCalled();
    expect(toast()).toBeInTheDocument();
  });

  it('leaves Ctrl+Z to the browser when no toast offers Undo', () => {
    renderDeletions();
    post('Entry added.');

    expect(pressUndoShortcut()).toBe(true);
    expect(toast()).toBeInTheDocument();
  });

  it('ignores other keys while a toast offers Undo', () => {
    const entry = deletion('Entry deleted.');
    renderDeletions(entry);
    post('Entry deleted.');

    expect(fireEvent.keyDown(document.body, { key: 'z' })).toBe(true);
    expect(entry.onUndo).not.toHaveBeenCalled();
  });
});
