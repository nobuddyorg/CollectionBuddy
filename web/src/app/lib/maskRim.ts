import { fillEach } from './fillEach';

// How far a pixel looks for the colours either side of the edge: a 7 x 7 window.
const REACH = 3;
// A model's rim of background is a pixel or two wide; more would eat into the object.
const PASSES = 2;
// Below this (RGB distance) the object and the background look alike here, and no colour can tell them apart.
const MIN_CONTRAST = 48;

type Picture = {
  mask: Uint8Array;
  pixels: ArrayLike<number>;
  width: number;
  height: number;
};

/** On the object, beside a background pixel; never wrapping from one row's end to the next's start. */
function isRim(mask: Uint8Array, index: number, width: number): boolean {
  const x = index % width;
  // A row off the image reads undefined, which is not background.
  return (
    mask[index] === 1 &&
    ((x > 0 && mask[index - 1] === 0) ||
      (x < width - 1 && mask[index + 1] === 0) ||
      mask[index - width] === 0 ||
      mask[index + width] === 0)
  );
}

/** Each side's summed colour and pixel count around `index`: the background, and the object's interior, the rim itself left out. */
function sidesAround(
  { mask, pixels, width, height }: Picture,
  rim: Uint8Array,
  index: number,
) {
  const background = [0, 0, 0, 0];
  const interior = [0, 0, 0, 0];
  const x = index % width;
  const y = Math.floor(index / width);
  const bottom = Math.min(height - 1, y + REACH);
  const right = Math.min(width - 1, x + REACH);
  for (let row = Math.max(0, y - REACH); row <= bottom; row += 1) {
    for (let column = Math.max(0, x - REACH); column <= right; column += 1) {
      const at = row * width + column;
      if (rim[at] === 1) continue;
      const side = mask[at] === 0 ? background : interior;
      side[0] += pixels[at * 4];
      side[1] += pixels[at * 4 + 1];
      side[2] += pixels[at * 4 + 2];
      side[3] += 1;
    }
  }
  return { background, interior };
}

const meanOf = ([red, green, blue, count]: number[]) => [
  red / count,
  green / count,
  blue / count,
];

const distance = (from: number[], to: number[]) =>
  Math.hypot(from[0] - to[0], from[1] - to[1], from[2] - to[2]);

/** Drops rim pixels whose colour is nearer the background beside them than the object behind them: the halo a model leaves. */
export function trimBackgroundRim(picture: Picture): Uint8Array {
  const { pixels, width } = picture;
  let mask = picture.mask;
  for (let pass = 0; pass < PASSES; pass += 1) {
    const current = mask;
    const rim = fillEach(new Uint8Array(current.length), (index) =>
      isRim(current, index, width) ? 1 : 0,
    );
    const next = current.slice();
    rim.forEach((onRim, index) => {
      if (onRim === 0) return;
      const { background, interior } = sidesAround(
        { ...picture, mask: current },
        rim,
        index,
      );
      // A side with no pixel here has a mean of NaN, which no comparison passes: a part too thin for an interior stays whole.
      const outside = meanOf(background);
      const behind = meanOf(interior);
      if (distance(outside, behind) < MIN_CONTRAST) return;
      const colour = [
        pixels[index * 4],
        pixels[index * 4 + 1],
        pixels[index * 4 + 2],
      ];
      if (distance(colour, outside) < distance(colour, behind)) next[index] = 0;
    });
    mask = next;
  }
  return mask;
}

// How far around the object the background is sampled for its colour.
const SURROUNDING = 8;

/** Whether each pixel lies within `reach` pixels (a square) of a marked one, by a summed-area table of the marks. */
function near(
  marked: Uint8Array,
  width: number,
  height: number,
  reach: number,
) {
  const table = new Uint32Array(marked.length);
  // Marks in the rectangle from the origin to (x, y); 0 left of or above the image.
  const sumTo = (x: number, y: number) =>
    x < 0 || y < 0
      ? 0
      : table[Math.min(y, height - 1) * width + Math.min(x, width - 1)];
  table.forEach((_, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    table[index] =
      marked[index] + sumTo(x - 1, y) + sumTo(x, y - 1) - sumTo(x - 1, y - 1);
  });
  return fillEach(new Uint8Array(marked.length), (index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    const inSquare =
      sumTo(x + reach, y + reach) -
      sumTo(x - reach - 1, y + reach) -
      sumTo(x + reach, y - reach - 1) +
      sumTo(x - reach - 1, y - reach - 1);
    return inSquare > 0 ? 1 : 0;
  });
}

/** The mean colour of the background just around the objects: what a hole showing the background would look like, gradients and vignettes aside. Infinite where there is none. */
export function colourAround({
  objects,
  isBackground,
  pixels,
  width,
  height,
}: {
  objects: Uint8Array;
  isBackground: (index: number) => boolean;
  pixels: ArrayLike<number>;
  width: number;
  height: number;
}): number[] {
  const surrounding = near(objects, width, height, SURROUNDING);
  const sum = [0, 0, 0];
  let count = 0;
  surrounding.forEach((inside, index) => {
    if (inside === 0 || !isBackground(index)) return;
    sum.forEach((_, channel) => (sum[channel] += pixels[index * 4 + channel]));
    count += 1;
  });
  if (count === 0) return [Infinity, Infinity, Infinity];
  return sum.map((total) => total / count);
}
