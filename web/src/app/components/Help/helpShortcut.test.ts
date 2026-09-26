import { describe, expect, it } from 'vitest';

import { isHelpShortcut } from './helpShortcut';

const press = (overrides: Partial<Parameters<typeof isHelpShortcut>[0]>) => ({
  key: '/',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  ...overrides,
});

describe('isHelpShortcut', () => {
  it('takes Ctrl+/', () => {
    expect(isHelpShortcut(press({ ctrlKey: true }))).toBe(true);
  });

  it('takes Cmd+/', () => {
    expect(isHelpShortcut(press({ metaKey: true }))).toBe(true);
  });

  it('ignores / on its own, which the search field types', () => {
    expect(isHelpShortcut(press({}))).toBe(false);
  });

  it('ignores another key with Ctrl', () => {
    expect(isHelpShortcut(press({ key: 'z', ctrlKey: true }))).toBe(false);
  });

  it('ignores a bare ?, a single-character shortcut', () => {
    expect(isHelpShortcut(press({ key: '?' }))).toBe(false);
  });

  it('ignores Ctrl+Alt+/', () => {
    expect(isHelpShortcut(press({ ctrlKey: true, altKey: true }))).toBe(false);
  });
});
