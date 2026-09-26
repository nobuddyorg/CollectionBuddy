// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { isUndoShortcut } from './undoShortcut';

const press = (overrides: Partial<Parameters<typeof isUndoShortcut>[0]>) => ({
  key: 'z',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  target: document.body,
  ...overrides,
});

describe('isUndoShortcut', () => {
  it('takes Ctrl+Z', () => {
    expect(isUndoShortcut(press({ ctrlKey: true }))).toBe(true);
  });

  it('takes Cmd+Z', () => {
    expect(isUndoShortcut(press({ metaKey: true }))).toBe(true);
  });

  it('takes Ctrl+Z with Caps Lock on', () => {
    expect(isUndoShortcut(press({ key: 'Z', ctrlKey: true }))).toBe(true);
  });

  it('ignores Z on its own', () => {
    expect(isUndoShortcut(press({}))).toBe(false);
  });

  it('ignores another key with Ctrl', () => {
    expect(isUndoShortcut(press({ key: 'y', ctrlKey: true }))).toBe(false);
  });

  it('leaves Ctrl+Shift+Z to redo', () => {
    expect(
      isUndoShortcut(press({ key: 'Z', ctrlKey: true, shiftKey: true })),
    ).toBe(false);
  });

  it('ignores Ctrl+Alt+Z', () => {
    expect(isUndoShortcut(press({ ctrlKey: true, altKey: true }))).toBe(false);
  });

  it('leaves Ctrl+Z inside a text input to undo the typing', () => {
    const target = document.createElement('input');
    expect(isUndoShortcut(press({ ctrlKey: true, target }))).toBe(false);
  });

  it('leaves Ctrl+Z inside a textarea to undo the typing', () => {
    const target = document.createElement('textarea');
    expect(isUndoShortcut(press({ ctrlKey: true, target }))).toBe(false);
  });

  it('takes Ctrl+Z on a button', () => {
    const target = document.createElement('button');
    expect(isUndoShortcut(press({ ctrlKey: true, target }))).toBe(true);
  });

  it('takes Ctrl+Z whose target is not an element, such as the document', () => {
    expect(isUndoShortcut(press({ ctrlKey: true, target: document }))).toBe(
      true,
    );
  });
});
