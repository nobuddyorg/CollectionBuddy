import { describe, expect, it } from 'vitest';

import { isPhotoStorageFull, isQuotaExceeded } from './quota';

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

describe('isPhotoStorageFull', () => {
  it('recognises the refusal that names the whole app', () => {
    expect(
      isPhotoStorageFull({
        code: 'PT507',
        details: 'project',
        message: 'the photo storage of this app is full',
      }),
    ).toBe(true);
  });

  it('finds it down a chain of wrapping errors', () => {
    const wrapped = new Error('outer', {
      cause: { code: 'PT507', details: 'project' },
    });
    expect(isPhotoStorageFull(wrapped)).toBe(true);
  });

  it('is false for the owner’s own quota', () => {
    expect(isPhotoStorageFull({ code: 'PT507', details: null })).toBe(false);
  });

  it('is false for another refusal carrying the same detail', () => {
    expect(isPhotoStorageFull({ code: '42501', details: 'project' })).toBe(
      false,
    );
  });

  it('is false for nothing at all', () => {
    expect(isPhotoStorageFull(undefined)).toBe(false);
  });
});
