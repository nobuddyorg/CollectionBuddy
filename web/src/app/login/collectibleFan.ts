// Where the collectible chips sit around the medallion.
//
// Two things this has to get right, both of which the old scatter got
// wrong. The offsets are measured in *coin diameters* rather than pixels,
// because the medallion is fluid (clamp(300px, 80vw, 420px)) and a pixel
// offset that cleared it on one screen sat on top of it on another. And
// the chips are kept out of the vertical band above and below the coin:
// pushing them far enough out to clear the rim there would land them on
// the wordmark and the subtitle instead.
//
// So the fan is two side lobes, left and right of the medallion, each an
// arc of ±45° about the horizontal. Every chip is outside the rim and
// none of them is anywhere near the type.

/** Half a coin: anything closer to the centre than this is on the coin. */
const COIN_RADIUS = 0.5;

/**
 * Air between the rim and the chip, again in coin diameters. A chip is
 * 44px wide, which is 0.073 of the smallest (300px) coin, so this leaves
 * roughly 17px of paper showing at the tightest -- and more as the coin
 * grows, since everything here scales with it.
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
 * Chips alternate sides so the two lobes stay balanced however many there
 * are, and each takes its own slot on the arc so they never bunch up --
 * with a little jitter, so the fan doesn't read as mechanically perfect.
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

    // An ellipse wider than it is tall, with *both* radii outside the rim:
    // the nearest point of an ellipse to its centre is the end of its
    // minor axis, so keeping the smaller radius clear keeps all of it
    // clear. The vertical spread stays tight on purpose -- it is the axis
    // with the wordmark at one end and the subtitle at the other.
    const rx = MIN_ORBIT + r() * 0.22;
    const ry = MIN_ORBIT + r() * 0.08;

    return {
      ux: side * Math.cos(angle) * rx,
      uy: Math.sin(angle) * ry,
    };
  });
}

/**
 * A fan offset as a CSS length, against the `--coin-size` the page
 * publishes.
 *
 * The horizontal one is clamped to the viewport so the widest chips stay
 * on screen on a narrow window rather than being cropped by the page's
 * own overflow. That only ever pulls a chip *inwards*, and only the
 * near-horizontal ones it can reach -- which are the chips with the least
 * vertical offset, so they stay clear of the rim on width alone.
 */
export function fanOffsetX(ux: number) {
  return `clamp(-42vw, calc(var(--coin-size) * ${ux.toFixed(4)}), 42vw)`;
}

export function fanOffsetY(uy: number) {
  return `calc(var(--coin-size) * ${uy.toFixed(4)})`;
}
