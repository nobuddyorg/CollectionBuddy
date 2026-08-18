import { describe, expect, it } from 'vitest';

import { resolveTranslationKey } from './I18nProvider';

describe('resolveTranslationKey', () => {
  const dict = {
    common: { close: 'Close', nested: { deep: 'Deep value' } },
  };

  it('resolves a top-level nested key', () => {
    expect(resolveTranslationKey(dict, 'common.close')).toBe('Close');
  });

  it('resolves a deeply nested key', () => {
    expect(resolveTranslationKey(dict, 'common.nested.deep')).toBe(
      'Deep value',
    );
  });

  it('returns undefined for a missing top-level segment', () => {
    expect(resolveTranslationKey(dict, 'missing.key')).toBeUndefined();
  });

  it('returns undefined for a missing leaf segment', () => {
    expect(resolveTranslationKey(dict, 'common.missing')).toBeUndefined();
  });

  it('returns undefined when the path resolves to an object, not a string', () => {
    expect(resolveTranslationKey(dict, 'common.nested')).toBeUndefined();
  });

  it('returns undefined instead of throwing when a segment resolves to a string too early', () => {
    // An extra trailing segment must report a miss, not do `'extra' in
    // 'Close'` (a TypeError).
    expect(resolveTranslationKey(dict, 'common.close.extra')).toBeUndefined();
  });

  it('returns undefined instead of throwing when a segment resolves to null', () => {
    // Translation JSON always bottoms out in strings, so this forces past
    // the type to exercise the runtime guard for malformed data.
    const withNull = { a: null } as unknown as Parameters<
      typeof resolveTranslationKey
    >[0];
    expect(resolveTranslationKey(withNull, 'a.b')).toBeUndefined();
  });

  it('stops at the first missing segment instead of continuing to match later segments against the original dict', () => {
    // Without an immediate return on miss, the loop would re-check 'b'
    // against the original dict (since `value` was never reassigned) and
    // wrongly resolve it.
    const dict2 = { b: 'real-value' };
    expect(resolveTranslationKey(dict2, 'missing.b')).toBeUndefined();
  });
});
