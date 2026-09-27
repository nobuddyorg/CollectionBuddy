type KeyPress = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>;

/** Ctrl+/ or Cmd+/: a bare "?" would be a single-character shortcut, which WCAG 2.1.4 rules out. */
export function isHelpShortcut(press: KeyPress): boolean {
  if (press.key !== '/') return false;
  // Shift stays allowed: a German layout types "/" as Shift+7.
  if (press.altKey) return false;
  return press.ctrlKey || press.metaKey;
}
