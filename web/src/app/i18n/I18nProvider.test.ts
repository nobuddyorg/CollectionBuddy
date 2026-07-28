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
    // 'common.close' already bottoms out on a string -- an extra trailing
    // segment must report a miss, not do `'extra' in 'Close'` (a TypeError).
    expect(resolveTranslationKey(dict, 'common.close.extra')).toBeUndefined();
  });

  it('returns undefined instead of throwing when a segment resolves to null', () => {
    // The type says this can't happen -- translation JSON always bottoms
    // out in strings -- but the runtime guard exists for malformed data,
    // so the test has to force past the type to exercise it.
    const withNull = { a: null } as unknown as Parameters<
      typeof resolveTranslationKey
    >[0];
    expect(resolveTranslationKey(withNull, 'a.b')).toBeUndefined();
  });

  it('stops at the first missing segment instead of continuing to match later segments against the original dict', () => {
    // If a miss on 'missing' failed to return immediately, the loop would
    // move on to 'b' and re-check it against the *original* dict (since
    // `value` was never reassigned) -- which does have a 'b' key, so this
    // would wrongly resolve instead of reporting the miss.
    const dict2 = { b: 'real-value' };
    expect(resolveTranslationKey(dict2, 'missing.b')).toBeUndefined();
  });
});
