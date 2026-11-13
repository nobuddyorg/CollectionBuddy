import { describe, expect, it } from 'vitest';

import { fillEach } from './fillEach';

describe('fillEach', () => {
  it('sets every element from its index and hands back the same array', () => {
    const target = new Uint8Array(4);

    const filled = fillEach(target, (index) => index * 10);

    expect(filled).toBe(target);
    expect(Array.from(filled)).toEqual([0, 10, 20, 30]);
  });

  it('clamps and rounds into a clamped array, as its `from` would', () => {
    expect(
      Array.from(
        fillEach(new Uint8ClampedArray(3), (index) => [-5, 1.5, 300][index]),
      ),
    ).toEqual([0, 2, 255]);
  });
});
