// Offsets in coin diameters, since the coin is fluid-sized; two ±45° side lobes keep clear of the wordmark.

const COIN_RADIUS = 0.5;

/** Rim-to-chip gap in coin diameters; a 44px chip clears even the smallest (300px) coin. */
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

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

/** Chips alternate sides and take fixed, slightly jittered slots along the arc, so the lobes stay balanced. */
export function fanPositions(count: number, seed = 1337): FanPosition[] {
  const random = seededRandom(seed);
  const perSide = Math.ceil(count / 2);
  const step = perSide > 1 ? (LOBE_HALF_ANGLE * 2) / (perSide - 1) : 0;

  return Array.from({ length: count }, (_, i) => {
    const side = i % 2 === 0 ? 1 : -1;
    const slot = Math.floor(i / 2);
    const angle =
      (perSide > 1 ? -LOBE_HALF_ANGLE + step * slot : 0) +
      (random() - 0.5) * step * 0.5;

    // The smaller radius sets the real clearance (an ellipse is closest on its minor axis); ry stays tight.
    const rx = MIN_ORBIT + random() * 0.22;
    const ry = MIN_ORBIT + random() * 0.08;

    return {
      ux: side * Math.cos(angle) * rx,
      uy: Math.sin(angle) * ry,
    };
  });
}

/** CSS length against --coin-size, clamped to the viewport so a wide chip is pulled inward, never cropped. */
export function fanOffsetX(ux: number) {
  return `clamp(-42vw, calc(var(--coin-size) * ${ux.toFixed(4)}), 42vw)`;
}

export function fanOffsetY(uy: number) {
  return `calc(var(--coin-size) * ${uy.toFixed(4)})`;
}
