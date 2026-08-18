// Offsets are in coin diameters, not pixels, because the medallion's size
// is fluid (clamp(300px, 80vw, 420px)); a pixel offset can't stay clear of
// the rim at every size. Chips stay out of the vertical band above/below
// the coin, since that's where the wordmark and subtitle sit, so the fan
// is two side lobes (left/right), each a ±45° arc.

const COIN_RADIUS = 0.5;

/**
 * Gap between rim and chip, in coin diameters; sized so a 44px chip
 * clears with room even at the smallest (300px) coin.
 */
const CHIP_CLEARANCE = 0.13;

/** The closest a chip's centre may come to the centre of the coin. */
export const MIN_ORBIT = COIN_RADIUS + CHIP_CLEARANCE;

/** Half the angular width of each lobe, in radians (45°). */
const LOBE_HALF_ANGLE = Math.PI / 4;

export type FanPosition = {
  /** Horizontal offset from the coin's centre, in coin diameters. */
  ux: number;
  /** Vertical offset from the coin's centre, in coin diameters. */
  uy: number;
};

function rng(seed: number) {
  let s = seed >>> 0;
  return () => (s = (1664525 * s + 1013904223) >>> 0) / 2 ** 32;
}

/**
 * Chips alternate sides to keep both lobes balanced, and take fixed
 * slots along the arc, with slight jitter, instead of bunching up.
 */
export function fanPositions(count: number, seed = 1337): FanPosition[] {
  const r = rng(seed);
  const perSide = Math.ceil(count / 2);
  const step = perSide > 1 ? (LOBE_HALF_ANGLE * 2) / (perSide - 1) : 0;

  return Array.from({ length: count }, (_, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const slot = Math.floor(i / 2);
    const angle =
      (perSide > 1 ? -LOBE_HALF_ANGLE + step * slot : 0) +
      (r() - 0.5) * step * 0.5;

    // Both radii must clear the rim: an ellipse's closest point to its
    // centre is on its minor axis, so the smaller radius sets the real
    // clearance. Vertical spread stays tight to clear the wordmark/subtitle.
    const rx = MIN_ORBIT + r() * 0.22;
    const ry = MIN_ORBIT + r() * 0.08;

    return {
      ux: side * Math.cos(angle) * rx,
      uy: Math.sin(angle) * ry,
    };
  });
}

/**
 * CSS length for a fan offset, against the `--coin-size` the page publishes.
 * Clamped to the viewport so wide chips aren't cropped; this only ever
 * pulls a chip inward, and only the near-horizontal ones, which already
 * clear the rim on width alone.
 */
export function fanOffsetX(ux: number) {
  return `clamp(-42vw, calc(var(--coin-size) * ${ux.toFixed(4)}), 42vw)`;
}

export function fanOffsetY(uy: number) {
  return `calc(var(--coin-size) * ${uy.toFixed(4)})`;
}
