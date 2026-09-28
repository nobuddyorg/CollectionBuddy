import { describe, expect, it, vi } from 'vitest';

import {
  formatNumbers,
  interpolate,
  type TranslationValues,
} from '../../i18n/I18nProvider';
import {
  importPartialMessage,
  importProgressMessage,
} from './useImportCategory';

describe('importProgressMessage', () => {
  const t = ((key: string, values: TranslationValues = {}) =>
    interpolate(
      {
        'category_select.import_reading': 'Reading the archive…',
        'category_select.import_items': 'Creating entries…',
        'category_select.import_photos': 'Photos {done} of {total}…',
      }[key] ?? key,
      values,
    )) as Parameters<typeof importProgressMessage>[1];

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

describe('importPartialMessage', () => {
  const t = ((key: string, values: TranslationValues = {}) =>
    interpolate(
      {
        'category_select.import_partial': '{skipped} of {total} left out.',
        'category_select.import_partial_quota':
          '{skipped} of {total} left out: your quota is full.',
        'category_select.import_partial_storage_full':
          "{skipped} of {total} left out: the app's storage is full.",
      }[key] ?? key,
      formatNumbers(values, new Intl.NumberFormat('de')),
    )) as Parameters<typeof importPartialMessage>[1];

  it('says nothing when every photograph arrived', () => {
    expect(
      importPartialMessage(
        { photoCount: 3, skippedPhotoCount: 0, photoQuotaReached: 'none' },
        t,
      ),
    ).toBeNull();
  });

  it('counts the photographs left out against all the archive held', () => {
    expect(
      importPartialMessage(
        { photoCount: 2, skippedPhotoCount: 1, photoQuotaReached: 'none' },
        t,
      ),
    ).toBe('1 of 3 left out.');
  });

  // Deleting photographs frees the owner's share, so the message must say that is what ran out.
  it("names the owner's quota when it stopped the rest", () => {
    expect(
      importPartialMessage(
        { photoCount: 5, skippedPhotoCount: 15, photoQuotaReached: 'owner' },
        t,
      ),
    ).toBe('15 of 20 left out: your quota is full.');
  });

  it("names the app's storage when that stopped the rest", () => {
    expect(
      importPartialMessage(
        { photoCount: 0, skippedPhotoCount: 4, photoQuotaReached: 'app' },
        t,
      ),
    ).toBe("4 of 4 left out: the app's storage is full.");
  });

  it('hands t the counts as numbers', () => {
    const spy = vi.fn(() => '');
    importPartialMessage(
      { photoCount: 2, skippedPhotoCount: 1000, photoQuotaReached: 'none' },
      spy,
    );
    expect(spy).toHaveBeenCalledWith('category_select.import_partial', {
      skipped: 1000,
      total: 1002,
    });
  });

  it('formats large counts in the digit grouping of the language', () => {
    expect(
      importPartialMessage(
        { photoCount: 2, skippedPhotoCount: 1000, photoQuotaReached: 'none' },
        t,
      ),
    ).toBe('1.000 of 1.002 left out.');
  });
});
