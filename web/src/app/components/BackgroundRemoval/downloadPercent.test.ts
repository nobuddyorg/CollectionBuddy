import { describe, expect, it } from 'vitest';

import { downloadPercent } from './downloadPercent';

describe('downloadPercent', () => {
  it('rounds to a whole percent', () => {
    expect(downloadPercent({ loaded: 1, total: 3 })).toBe(33);
    expect(downloadPercent({ loaded: 2, total: 3 })).toBe(67);
  });

  it('is 0 while the size is unknown', () => {
    expect(downloadPercent({ loaded: 45, total: 0 })).toBe(0);
  });

  it('reaches exactly 100 once everything is in', () => {
    expect(downloadPercent({ loaded: 90, total: 90 })).toBe(100);
  });

  it('never passes 100 when more arrives than announced', () => {
    expect(downloadPercent({ loaded: 120, total: 90 })).toBe(100);
  });
});
