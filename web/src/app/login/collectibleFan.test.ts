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

  // Offsets are in coin diameters, so clearing the rim (radius 0.5) holds at every size the coin takes.
  it('keeps every chip clear of the coin', () => {
    for (const position of fanPositions(10)) {
      expect(distance(position)).toBeGreaterThanOrEqual(MIN_ORBIT);
    }
  });

  it('keeps them clear at any number of chips', () => {
    for (const count of [1, 2, 3, 7, 24]) {
      for (const position of fanPositions(count)) {
        expect(distance(position)).toBeGreaterThanOrEqual(MIN_ORBIT);
      }
    }
  });

  // Above and below belong to the wordmark and the subtitle; the chips' room is to the left and right.
  it('fans out sideways, alternating between the two lobes', () => {
    const positions = fanPositions(10);
    positions.forEach((position, i) => {
      expect(Math.sign(position.ux)).toBe(i % 2 === 0 ? 1 : -1);
      // No chip rises into the band above the coin, which belongs to the wordmark.
      expect(Math.abs(position.uy)).toBeLessThan(MIN_ORBIT);
    });
    const widest = Math.max(
      ...positions.map((position) => Math.abs(position.ux)),
    );
    const tallest = Math.max(
      ...positions.map((position) => Math.abs(position.uy)),
    );
    expect(widest).toBeGreaterThan(tallest);
  });

  // Each chip in a lobe takes its own slot down the arc rather than landing at a random angle.
  it('spreads a lobe down the arc instead of bunching up', () => {
    const right = fanPositions(10).filter((position) => position.ux > 0);
    const verticalOffsets = right.map((position) => position.uy);
    expect(verticalOffsets).toEqual([...verticalOffsets].sort((a, b) => a - b));
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

  // Clamped so the widest chips stay on screen on a narrow window; it only ever pulls a chip inwards.
  it('holds the horizontal offset inside the viewport', () => {
    expect(fanOffsetX(-0.75)).toBe(
      'clamp(-42vw, calc(var(--coin-size) * -0.7500), 42vw)',
    );
  });
});
