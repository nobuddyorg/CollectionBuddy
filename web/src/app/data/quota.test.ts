import { describe, expect, it } from 'vitest';

import { isQuotaExceeded } from './quota';

describe('isQuotaExceeded', () => {
  it('recognises the quota refusal PostgREST passes through', () => {
    expect(isQuotaExceeded({ code: 'PT507', message: 'quota' })).toBe(true);
  });

  it('finds it down a chain of wrapping errors', () => {
    const wrapped = new Error('outer', {
      cause: new Error('middle', { cause: { code: 'PT507' } }),
    });
    expect(isQuotaExceeded(wrapped)).toBe(true);
  });

  it('is false for any other refusal', () => {
    expect(isQuotaExceeded({ code: '42501' })).toBe(false);
    expect(isQuotaExceeded(new Error('offline'))).toBe(false);
  });

  it('is false for nothing at all', () => {
    expect(isQuotaExceeded(null)).toBe(false);
    expect(isQuotaExceeded(undefined)).toBe(false);
  });
});
