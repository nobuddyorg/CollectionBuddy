import { describe, expect, it } from 'vitest';

import { exportProgressMessage } from './useExportCategory';

// Stands in for the real `t`: returns the key's own English string so the
// assertions below read as what a user would see, and proves which key was
// asked for at the same time.
const strings: Record<string, string> = {
  'category_select.export_reading': 'Reading entries…',
  'category_select.export_photos': 'Photographs {done} of {total}…',
  'category_select.export_packing': 'Packing the archive…',
};
const t = ((key: string) => strings[key] ?? key) as Parameters<
  typeof exportProgressMessage
>[1];

describe('exportProgressMessage', () => {
  it('says nothing when no export is running', () => {
    expect(exportProgressMessage(null, t)).toBeNull();
  });

  it('reports reading while the entries are still coming in', () => {
    expect(
      exportProgressMessage({ phase: 'items', done: 0, total: 0 }, t),
    ).toBe('Reading entries…');
  });

  it('counts the photographs, which is the part that takes the time', () => {
    expect(
      exportProgressMessage({ phase: 'photos', done: 3, total: 48 }, t),
    ).toBe('Photographs 3 of 48…');
  });

  it('fills both placeholders, not just the first', () => {
    const message = exportProgressMessage(
      { phase: 'photos', done: 7, total: 9 },
      t,
    );
    expect(message).not.toContain('{');
    expect(message).toContain('7');
    expect(message).toContain('9');
  });

  it('reports packing once the photographs are in', () => {
    expect(
      exportProgressMessage({ phase: 'packing', done: 48, total: 48 }, t),
    ).toBe('Packing the archive…');
  });

  it('does not count to zero for a category whose items have no photographs', () => {
    // "0 of 0" reads as a stall. There is nothing to count here, so the
    // message falls through to the phase that is actually doing work.
    expect(
      exportProgressMessage({ phase: 'photos', done: 0, total: 0 }, t),
    ).toBe('Packing the archive…');
  });
});
