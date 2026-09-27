type KeyPress = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey' | 'target'
>;

/** Ctrl+Z or Cmd+Z outside a text field, which keeps its own undo of what was typed. */
export function isUndoShortcut(press: KeyPress): boolean {
  if (press.key.toLowerCase() !== 'z') return false;
  if (!(press.ctrlKey || press.metaKey)) return false;
  if (press.shiftKey || press.altKey) return false;
  return !(
    press.target instanceof Element && press.target.matches('input, textarea')
  );
}
