import { describe, expect, it } from 'vitest';

import { resolveTranslationKey } from './I18nProvider';

describe('resolveTranslationKey', () => {
  const dictionary = {
    common: { close: 'Close', nested: { deep: 'Deep value' } },
  };

  it('resolves a top-level nested key', () => {
    expect(resolveTranslationKey(dictionary, 'common.close')).toBe('Close');
  });

  it('resolves a deeply nested key', () => {
    expect(resolveTranslationKey(dictionary, 'common.nested.deep')).toBe(
      'Deep value',
    );
  });

  it('returns undefined for a missing top-level segment', () => {
    expect(resolveTranslationKey(dictionary, 'missing.key')).toBeUndefined();
  });

  it('returns undefined for a missing leaf segment', () => {
    expect(resolveTranslationKey(dictionary, 'common.missing')).toBeUndefined();
  });

  it('returns undefined when the path resolves to an object, not a string', () => {
    expect(resolveTranslationKey(dictionary, 'common.nested')).toBeUndefined();
  });

  it('returns undefined instead of throwing when a segment resolves to a string too early', () => {
    // An extra trailing segment must be a miss, not `'extra' in 'Close'` (a TypeError).
    expect(
      resolveTranslationKey(dictionary, 'common.close.extra'),
    ).toBeUndefined();
  });

  it('returns undefined for a numeric trailing segment instead of indexing into a leaf string', () => {
    // A boxed string has its characters as own properties, so a looser check would resolve this to 'C'.
    expect(resolveTranslationKey(dictionary, 'common.close.0')).toBeUndefined();
  });

  it('returns undefined instead of throwing when a segment resolves to null', () => {
    // Translation JSON bottoms out in strings; this forces past the type to reach the runtime guard.
    const withNull = { a: null } as unknown as Parameters<
      typeof resolveTranslationKey
    >[0];
    expect(resolveTranslationKey(withNull, 'a.b')).toBeUndefined();
  });

  it('stops at the first missing segment instead of continuing to match later segments against the original dict', () => {
    // Without an immediate return on miss, 'b' would be re-checked against the original dictionary and resolve.
    const flatDictionary = { b: 'real-value' };
    expect(resolveTranslationKey(flatDictionary, 'missing.b')).toBeUndefined();
  });
});
