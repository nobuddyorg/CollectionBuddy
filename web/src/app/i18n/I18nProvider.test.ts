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
});
