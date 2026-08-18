import { describe, expect, it } from 'vitest';

import {
  MIN_ORBIT,
  fanOffsetX,
  fanOffsetY,
  fanPositions,
} from './collectibleFan';

const distance = ({ ux, uy }: { ux: number; uy: number }) => Math.hypot(ux, uy);

describe('fanPositions', () => {
  it('gives every chip a place', () => {
    expect(fanPositions(10)).toHaveLength(10);
  });

  // Offsets are in coin diameters, so a chip clears the rim (radius 0.5)
  // at every size the coin takes.
  it('keeps every chip clear of the coin', () => {
    for (const p of fanPositions(10)) {
      expect(distance(p)).toBeGreaterThanOrEqual(MIN_ORBIT);
    }
  });

  it('keeps them clear at any number of chips', () => {
    for (const count of [1, 2, 3, 7, 24]) {
      for (const p of fanPositions(count)) {
        expect(distance(p)).toBeGreaterThanOrEqual(MIN_ORBIT);
      }
    }
  });

  // Above and below is where the wordmark and the subtitle are; the room
  // the chips get is to the left and the right.
  it('fans out sideways, alternating between the two lobes', () => {
    const positions = fanPositions(10);
    positions.forEach((p, i) => {
      expect(Math.sign(p.ux)).toBe(i % 2 === 0 ? 1 : -1);
      // No chip rises as far as it would have to to sit above the coin --
      // that band belongs to the wordmark.
      expect(Math.abs(p.uy)).toBeLessThan(MIN_ORBIT);
    });
    const widest = Math.max(...positions.map((p) => Math.abs(p.ux)));
    const tallest = Math.max(...positions.map((p) => Math.abs(p.uy)));
    expect(widest).toBeGreaterThan(tallest);
  });

  // Within a lobe each chip takes its own slot on the arc, top to bottom,
  // rather than landing wherever a random angle puts it.
  it('spreads a lobe down the arc instead of bunching up', () => {
    const right = fanPositions(10).filter((p) => p.ux > 0);
    const ys = right.map((p) => p.uy);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
  });

  it('is stable for a given seed and different for another', () => {
    expect(fanPositions(10)).toEqual(fanPositions(10));
    expect(fanPositions(10)).not.toEqual(fanPositions(10, 99));
  });
});

describe('fan offsets', () => {
  it('measures the vertical offset in coins', () => {
    expect(fanOffsetY(0.5)).toBe('calc(var(--coin-size) * 0.5000)');
  });

  // Clamped so the widest chips stay on screen on a narrow window; it only
  // ever pulls a chip inwards, and only the near-horizontal ones.
  it('holds the horizontal offset inside the viewport', () => {
    expect(fanOffsetX(-0.75)).toBe(
      'clamp(-42vw, calc(var(--coin-size) * -0.7500), 42vw)',
    );
  });
});
