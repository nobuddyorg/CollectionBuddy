import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  THEME_MEDIA_QUERY,
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  normalizePreference,
  resolveTheme,
} from './useTheme';

describe('normalizePreference', () => {
  it('keeps an explicit choice', () => {
    expect(normalizePreference('light')).toBe('light');
    expect(normalizePreference('dark')).toBe('dark');
  });

  // Nothing stored is the common case -- a first visit, or a visitor who
  // went back to system, which clears the key rather than writing a third
  // value. Both have to arrive at the same place.
  it('falls back to system when nothing is stored', () => {
    expect(normalizePreference(null)).toBe('system');
  });

  it('falls back to system for a value that is not a theme', () => {
    expect(normalizePreference('')).toBe('system');
    expect(normalizePreference('sepia')).toBe('system');
    expect(normalizePreference('Dark')).toBe('system');
  });

  // 'system' is never written, but a value left by an older build of the
  // app -- or by hand -- must not be mistaken for an explicit choice.
  it('treats a stored "system" as no choice at all', () => {
    expect(normalizePreference('system')).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('follows the OS while the preference is system', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  // The point of offering light and dark alongside system: an explicit
  // choice has to win over the OS, in both directions.
  it('overrides the OS with an explicit choice', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('leaves an explicit choice alone when the OS agrees with it', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('light', false)).toBe('light');
  });
});

// The script that runs before the first paint cannot import this module --
// it is a string inlined into the document head, which is the only thing
// that runs early enough to stop the flash. So it restates the storage key
// and the media query by hand, and the two copies have to agree: change one
// and the page loads light, then corrects itself once React catches up,
// which is the exact defect the script exists to prevent.
describe('the pre-paint script in layout.tsx', () => {
  const layout = readFileSync(new URL('layout.tsx', import.meta.url), 'utf8');
  const initScript = layout.slice(layout.indexOf('const THEME_INIT_SCRIPT'));

  it('reads the same storage key the hook writes', () => {
    expect(initScript).toContain(`'${THEME_STORAGE_KEY}'`);
  });

  it('asks the OS the same question the hook asks', () => {
    expect(initScript).toContain(`'${THEME_MEDIA_QUERY}'`);
  });

  it('writes the attribute the dark variant in globals.css selects on', () => {
    const css = readFileSync(new URL('globals.css', import.meta.url), 'utf8');
    expect(initScript).toContain(`setAttribute('data-theme'`);
    expect(css).toContain(`[data-theme='dark']`);
  });
});

describe('THEME_PREFERENCES', () => {
  // Order is what the control renders, and system leads because it is the
  // default -- the segment already selected for anyone who has not chosen.
  it('offers system, light and dark in that order', () => {
    expect(THEME_PREFERENCES).toEqual(['system', 'light', 'dark']);
  });
});
