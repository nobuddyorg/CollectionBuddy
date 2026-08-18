import { describe, expect, it } from 'vitest';

import { coinSizeCss } from './size';

describe('coinSizeCss', () => {
  it('is fluid between a floor and the size asked for', () => {
    expect(coinSizeCss(420)).toBe('clamp(300px, 80vw, 420px)');
  });

  it('carries the requested size through as the ceiling', () => {
    expect(coinSizeCss(280)).toBe('clamp(300px, 80vw, 280px)');
  });

  // 80vw alone would shrink the coin to nothing on a narrow viewport.
  it('keeps a floor no viewport can shrink past', () => {
    expect(coinSizeCss(420)).toContain('300px');
    expect(coinSizeCss(420)).toContain('80vw');
  });
});
