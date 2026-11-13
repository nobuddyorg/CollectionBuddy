import { describe, expect, it } from 'vitest';

import { BLUR_THRESHOLD, isBlurry, sharpnessScore } from './sharpness';

type Rgb = [number, number, number];

/** A picture drawn by `colourAt`, as the RGBA bytes a canvas hands back. */
function picture(
  width: number,
  height: number,
  colourAt: (x: number, y: number) => Rgb,
) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      rgba.set([...colourAt(x, y), 255], (y * width + x) * 4);
    }
  }
  return { rgba, size: { width, height } };
}

const grey = (value: number): Rgb => [value, value, value];
const score = ({ rgba, size }: ReturnType<typeof picture>) =>
  sharpnessScore(rgba, size);

/** 0 and 100 alternating: every interior pixel's Laplacian is ±400, a variance of 160 000. */
const checker = (x: number, y: number) => grey((x + y) % 2 === 0 ? 100 : 0);
const CHECKER_VARIANCE = 160_000;

describe('sharpnessScore', () => {
  it('scores a uniform picture 0: no edge at all', () => {
    expect(score(picture(20, 20, () => grey(128)))).toBe(0);
  });

  // Interior Laplacians -40 and 10: mean -15, variance 625.
  it('is the variance of the Laplacian over the interior pixels', () => {
    expect(
      score(picture(4, 3, (x, y) => grey(x === 1 && y === 1 ? 10 : 0))),
    ).toBe(625);
  });

  // One interior Laplacian of 10 among three: variance 200/9, whichever neighbour carries it.
  it.each([
    ['above', 2, 0],
    ['below', 2, 2],
    ['left of', 0, 1],
    ['right of', 4, 1],
  ])('counts an edge %s an interior pixel', (_where, brightX, brightY) => {
    expect(
      score(
        picture(5, 3, (x, y) => grey(x === brightX && y === brightY ? 10 : 0)),
      ),
    ).toBeCloseTo(200 / 9, 10);
  });

  // A lone pixel of luma c among black ones scores 6.25 c².
  it.each([
    ['red', [255, 0, 0] as Rgb, 0.299],
    ['green', [0, 255, 0] as Rgb, 0.587],
    ['blue', [0, 0, 255] as Rgb, 0.114],
  ])('weighs %s by its share of luma', (_name, colour, weight) => {
    const luma = weight * 255;
    expect(
      score(picture(4, 3, (x, y) => (x === 1 && y === 1 ? colour : grey(0)))),
    ).toBeCloseTo(6.25 * luma * luma, 1);
  });

  it('ignores transparency, which a decoded photo does not have anyway', () => {
    const opaque = picture(4, 3, (x, y) => grey(x === 1 && y === 1 ? 10 : 0));
    const seeThrough = new Uint8ClampedArray(opaque.rgba);
    for (let alpha = 3; alpha < seeThrough.length; alpha += 4) {
      seeThrough[alpha] = 0;
    }
    expect(sharpnessScore(seeThrough, opaque.size)).toBe(625);
  });

  it('judges a picture smaller than one tile as a whole', () => {
    expect(score(picture(40, 30, checker))).toBe(CHECKER_VARIANCE);
  });

  // Interior 128 x 64: two tiles, one textured and one plain; the plain one does not drag the score down.
  it('is not lowered by a plain backdrop beside a sharp item', () => {
    const halfTextured = picture(130, 66, (x, y) =>
      x <= 65 ? checker(x, y) : grey(0),
    );
    expect(score(halfTextured)).toBe(CHECKER_VARIANCE);
  });

  // Interior 320 x 256: twenty tiles, the item filling one of them and the pixels around it.
  it('reads a small sharp item on a large plain table as sharp', () => {
    const smallItem = picture(322, 258, (x, y) =>
      x >= 128 && x <= 193 && y >= 128 && y <= 193 ? checker(x, y) : grey(180),
    );
    expect(score(smallItem)).toBe(CHECKER_VARIANCE);
  });

  it('is decided by the sharpest tile, wherever it is', () => {
    const softLeftSharpRight = picture(130, 66, (x, y) =>
      x >= 64 ? checker(x, y) : grey(x % 2 === 0 ? 2 : 0),
    );
    expect(score(softLeftSharpRight)).toBe(CHECKER_VARIANCE);
  });

  it('reads the tiles below the first row too', () => {
    const lowerTextured = picture(66, 130, (x, y) =>
      y >= 64 ? checker(x, y) : grey(0),
    );
    expect(score(lowerTextured)).toBe(CHECKER_VARIANCE);
  });

  // A hard step against the same step ramped over 16 px, as a defocused lens draws it.
  it('scores a hard edge sharp and the same edge softened blurry', () => {
    const hard = picture(70, 70, (x) => grey(x < 35 ? 0 : 255));
    const soft = picture(70, 70, (x) =>
      grey(Math.min(255, Math.max(0, (x - 27) * 16))),
    );
    expect(isBlurry(score(hard))).toBe(false);
    expect(isBlurry(score(soft))).toBe(true);
    expect(score(soft)).toBeLessThan(score(hard));
  });

  it('has nothing to judge, and scores Infinity, without an interior pixel', () => {
    expect(score(picture(2, 10, checker))).toBe(Number.POSITIVE_INFINITY);
    expect(score(picture(10, 2, checker))).toBe(Number.POSITIVE_INFINITY);
  });

  it('judges the smallest picture with an interior pixel', () => {
    expect(score(picture(3, 3, () => grey(9)))).toBe(0);
  });
});

describe('isBlurry', () => {
  it('is blurry below the threshold and sharp from it on', () => {
    expect(isBlurry(BLUR_THRESHOLD - 0.01)).toBe(true);
    expect(isBlurry(BLUR_THRESHOLD)).toBe(false);
    expect(isBlurry(Number.POSITIVE_INFINITY)).toBe(false);
  });
});
