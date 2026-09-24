import { describe, expect, it } from 'vitest';

import { importProgressMessage } from './useImportCategory';

describe('importProgressMessage', () => {
  const t = ((key: string) =>
    ({
      'category_select.import_reading': 'Reading the archive…',
      'category_select.import_items': 'Creating entries…',
      'category_select.import_photos': 'Photos {done} of {total}…',
    })[key] ?? key) as Parameters<typeof importProgressMessage>[1];

  it('says nothing when no import is running', () => {
    expect(importProgressMessage(null, t)).toBeNull();
  });

  it('counts photographs once there are any to count', () => {
    expect(
      importProgressMessage({ phase: 'photos', done: 2, total: 5 }, t),
    ).toBe('Photos 2 of 5…');
  });

  // "0 of 0" would be a progress bar for work that does not exist.
  it('falls back to the entries wording for a photo phase with nothing to do', () => {
    expect(
      importProgressMessage({ phase: 'photos', done: 0, total: 0 }, t),
    ).toBe('Creating entries…');
  });

  it('names the reading and entry phases', () => {
    expect(
      importProgressMessage({ phase: 'reading', done: 0, total: 0 }, t),
    ).toBe('Reading the archive…');
    expect(
      importProgressMessage({ phase: 'items', done: 1, total: 3 }, t),
    ).toBe('Creating entries…');
  });
});
