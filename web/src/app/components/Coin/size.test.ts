import { describe, expect, it } from 'vitest';

import { coinSizeCss } from './size';

// The login page arranges itself *around* the medallion, so this string is a
// shared measurement rather than a style: both sides have to compute the same
// size from the same number or the layout is built around a coin that is not
// the size it thinks it is.
describe('coinSizeCss', () => {
  it('is fluid between a floor and the size asked for', () => {
    expect(coinSizeCss(420)).toBe('clamp(300px, 80vw, 420px)');
  });

  it('carries the requested size through as the ceiling', () => {
    expect(coinSizeCss(280)).toBe('clamp(300px, 80vw, 280px)');
  });

  // The floor is why: a fixed 420px coin touched both edges of a 390px
  // screen, and 80vw alone would shrink it to nothing on a narrow one.
  it('keeps a floor no viewport can shrink past', () => {
    expect(coinSizeCss(420)).toContain('300px');
    expect(coinSizeCss(420)).toContain('80vw');
  });
});
