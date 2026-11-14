import { describe, expect, it } from 'vitest';

import { colourAround, trimBackgroundRim } from './maskRim';

type Rgb = [number, number, number];

/** A mask and an RGB photo drawn by predicates, as the cut-out sees them. */
function picture(
  width: number,
  height: number,
  {
    inside,
    colourAt,
  }: {
    inside: (x: number, y: number) => boolean;
    colourAt: (x: number, y: number) => Rgb;
  },
) {
  const mask = new Uint8Array(width * height);
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      mask[y * width + x] = inside(x, y) ? 1 : 0;
      pixels.set([...colourAt(x, y), 255], (y * width + x) * 4);
    }
  }
  return { mask, pixels, width, height };
}

const grey = (value: number): Rgb => [value, value, value];
const count = (mask: Uint8Array) => mask.reduce((sum, value) => sum + value, 0);
const within = (low: number, high: number) => (x: number, y: number) =>
  x >= low && x <= high && y >= low && y <= high;

/** A bright square on a dark table, its outer `rim` pixels the table's colour: the halo a model leaves. */
function haloedSquare(rim: number) {
  const square = within(5, 14);
  const core = within(5 + rim, 14 - rim);
  return picture(20, 20, {
    inside: square,
    colourAt: (x, y) => (core(x, y) ? grey(230) : grey(22)),
  });
}

describe('trimBackgroundRim', () => {
  it('drops a two-pixel rim that has the background colour, down to the object', () => {
    const trimmed = trimBackgroundRim(haloedSquare(2));

    expect(Array.from(trimmed)).toEqual(
      Array.from(
        picture(20, 20, { inside: within(7, 12), colourAt: () => grey(0) })
          .mask,
      ),
    );
  });

  it('goes no deeper than two pixels, so it never eats far into an object', () => {
    const trimmed = trimBackgroundRim(haloedSquare(3));

    // 10 x 10 less two rings: the third ring of halo stays.
    expect(count(trimmed)).toBe(36);
    expect(trimmed[6 * 20 + 6]).toBe(0);
    expect(trimmed[7 * 20 + 7]).toBe(1);
  });

  it('leaves an object whose edge has its own colour as it is', () => {
    const clean = haloedSquare(0);

    expect(Array.from(trimBackgroundRim(clean))).toEqual(
      Array.from(clean.mask),
    );
  });

  it('leaves the mask it was given as it was', () => {
    const haloed = haloedSquare(2);
    const before = Array.from(haloed.mask);

    trimBackgroundRim(haloed);

    expect(Array.from(haloed.mask)).toEqual(before);
  });

  // Table 100, item 100 + shift on every channel, a 1 px rim the table's colour: RGB distance shift * √3.
  it.each([
    [27, 'keeps', 100],
    [28, 'trims', 64],
  ])(
    'with the item %d brighter than the table, %s the rim: 48 is where colour starts to tell them apart',
    (shift, _verb, left) => {
      const square = within(5, 14);
      const core = within(6, 13);
      const lowContrast = picture(20, 20, {
        inside: square,
        colourAt: (x, y) => (core(x, y) ? grey(100 + shift) : grey(100)),
      });

      expect(count(trimBackgroundRim(lowContrast))).toBe(left);
    },
  );

  it('keeps a part too thin to have an interior, however it is coloured', () => {
    const line = picture(20, 9, {
      inside: (x, y) => y === 4 && x >= 2 && x <= 17,
      colourAt: () => grey(30),
    });

    expect(Array.from(trimBackgroundRim(line))).toEqual(Array.from(line.mask));
  });

  // The last column's next index is the first pixel of the row below; it is not a neighbour.
  it('does not take the start of the next row for a neighbour of a row end', () => {
    const wrapped = picture(10, 10, {
      inside: (x, y) => !(x === 0 && y === 5) && !(x === 8 && y === 2),
      colourAt: (x, y) =>
        (x === 0 && y === 5) || (x === 8 && y === 2) || (x === 9 && y === 4)
          ? grey(20)
          : grey(230),
    });

    expect(trimBackgroundRim(wrapped)[4 * 10 + 9]).toBe(1);
  });

  it('does not take the end of the row above for a neighbour of a row start', () => {
    const wrapped = picture(10, 10, {
      inside: (x, y) => !(x === 9 && y === 4) && !(x === 1 && y === 7),
      colourAt: (x, y) =>
        (x === 9 && y === 4) || (x === 1 && y === 7) || (x === 0 && y === 5)
          ? grey(20)
          : grey(230),
    });

    expect(trimBackgroundRim(wrapped)[5 * 10 + 0]).toBe(1);
  });

  // A dark pixel below a background pixel, and one above another: each is rim, and goes.
  it('counts the pixels above and below as neighbours too', () => {
    const above = picture(10, 10, {
      inside: (x, y) => !(x === 5 && y === 4),
      colourAt: (x, y) =>
        x === 5 && (y === 4 || y === 5) ? grey(20) : grey(230),
    });
    const below = picture(10, 10, {
      inside: (x, y) => !(x === 5 && y === 5),
      colourAt: (x, y) =>
        x === 5 && (y === 4 || y === 5) ? grey(20) : grey(230),
    });

    expect(trimBackgroundRim(above)[5 * 10 + 5]).toBe(0);
    expect(trimBackgroundRim(below)[4 * 10 + 5]).toBe(0);
  });
});

describe('trimBackgroundRim at its limits', () => {
  /** A square on a table, its 1 px rim coloured `rim`, the rest `item`. */
  function rimmed(item: Rgb, table: Rgb, rim: Rgb, square = within(5, 14)) {
    const core = (x: number, y: number) =>
      square(x, y) &&
      square(x - 1, y) &&
      square(x + 1, y) &&
      square(x, y - 1) &&
      square(x, y + 1);
    return picture(20, 20, {
      inside: square,
      colourAt: (x, y) => (core(x, y) ? item : square(x, y) ? rim : table),
    });
  }

  it('starts to trim at a contrast of exactly 48', () => {
    const trimmed = trimBackgroundRim(
      rimmed([148, 100, 100], [100, 100, 100], [100, 100, 100]),
    );

    expect(count(trimmed)).toBe(64);
  });

  // Equally far from both sides, the pixel is not plainly background, and stays.
  it('keeps a rim pixel exactly halfway between the two colours', () => {
    const halfway = rimmed(grey(200), grey(0), grey(100));

    expect(count(trimBackgroundRim(halfway))).toBe(100);
  });

  // Blue table, red item, a blue rim: every channel counts, the blue one too.
  it('judges a rim pixel by all three of its channels', () => {
    const trimmed = trimBackgroundRim(
      rimmed([200, 0, 0], [0, 0, 200], [0, 0, 200]),
    );

    expect(count(trimmed)).toBe(64);
  });

  // Rim 125 sits a hair nearer the table (22) than the item (230); two far columns of black, read by a window wrapping past the right edge, would tip it.
  it('does not read past the right edge into the next row', () => {
    const square = (x: number, y: number) => x >= 8 && y >= 8;
    const core = (x: number, y: number) => x >= 9 && y >= 9;
    const corner = picture(20, 20, {
      inside: square,
      colourAt: (x, y) => {
        if (core(x, y)) return grey(230);
        if (square(x, y)) return grey(125);
        return x <= 1 ? grey(0) : grey(22);
      },
    });

    expect(count(trimBackgroundRim(corner))).toBe(121);
  });

  it('trims a rim against the bottom and right edges of the frame', () => {
    const corner = rimmed(
      grey(230),
      grey(22),
      grey(22),
      (x, y) => x >= 8 && y >= 8,
    );

    // 12 x 12 square to the corner; its rim is only the top and left sides, which go.
    expect(count(trimBackgroundRim(corner))).toBe(121);
  });
});

describe('colourAround', () => {
  // A 10 x 10 item in a 40 x 40 photo: red up to 8 px from it, blue beyond.
  const near = (x: number, y: number) =>
    Math.max(Math.abs(x - 19.5) - 4.5, Math.abs(y - 19.5) - 4.5) <= 8;
  const photo = picture(40, 40, {
    inside: within(15, 24),
    colourAt: (x, y) => (near(x, y) ? [100, 0, 0] : [0, 0, 200]),
  });

  it('is the background just around the objects, not the far edges of the frame', () => {
    expect(
      colourAround({
        objects: photo.mask,
        isBackground: (index) => photo.mask[index] === 0,
        pixels: photo.pixels,
        width: 40,
        height: 40,
      }),
    ).toEqual([100, 0, 0]);
  });

  it('counts only what is background, not a hole in the object', () => {
    const tinted = Uint8Array.from(photo.pixels);
    tinted.set([0, 200, 0, 255], (10 * 40 + 10) * 4);

    const colour = colourAround({
      objects: photo.mask,
      isBackground: (index) =>
        photo.mask[index] === 0 && index !== 10 * 40 + 10,
      pixels: tinted,
      width: 40,
      height: 40,
    });

    expect(colour).toEqual([100, 0, 0]);
  });

  it('reaches the frame edge from an object that touches it', () => {
    const edge = picture(12, 12, {
      inside: (x) => x === 0,
      colourAt: (x) => (x <= 8 ? [10, 20, 30] : [200, 200, 200]),
    });

    expect(
      colourAround({
        objects: edge.mask,
        isBackground: (index) => edge.mask[index] === 0,
        pixels: edge.pixels,
        width: 12,
        height: 12,
      }),
    ).toEqual([10, 20, 30]);
  });

  // Brute force: every background pixel at most 8 px (a square) from an object pixel, colours varying, objects at all four edges.
  it.each([
    [
      'near the top left corner',
      (x: number, y: number) => x >= 2 && x <= 6 && y >= 1 && y <= 5,
    ],
    [
      'near the bottom right corner',
      (x: number, y: number) => x >= 22 && x <= 27 && y >= 24 && y <= 28,
    ],
    [
      'in the middle',
      (x: number, y: number) => x >= 12 && x <= 15 && y >= 12 && y <= 16,
    ],
    [
      'as a strip along the top edge',
      (x: number, y: number) => x >= 10 && x <= 14 && y === 0,
    ],
  ])(
    'averages exactly the background within 8 px of objects %s',
    (_where, inside) => {
      const width = 30;
      const height = 31;
      const colourful = picture(width, height, {
        inside,
        colourAt: (x, y) => [x * 7, y * 5, (x * y) % 251],
      });
      const objectPixels: Array<[number, number]> = [];
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1)
          if (inside(x, y)) objectPixels.push([x, y]);
      }
      const sum = [0, 0, 0];
      let counted = 0;
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          if (inside(x, y)) continue;
          const reach = Math.min(
            ...objectPixels.map(([ox, oy]) =>
              Math.max(Math.abs(ox - x), Math.abs(oy - y)),
            ),
          );
          if (reach > 8) continue;
          [x * 7, y * 5, (x * y) % 251].forEach(
            (value, channel) => (sum[channel] += value),
          );
          counted += 1;
        }
      }

      const colour = colourAround({
        objects: colourful.mask,
        isBackground: (index) => colourful.mask[index] === 0,
        pixels: colourful.pixels,
        width,
        height,
      });

      colour.forEach((value, channel) =>
        expect(value).toBeCloseTo(sum[channel] / counted, 10),
      );
    },
  );

  it('is infinite where the objects leave no background at all', () => {
    const full = picture(5, 5, { inside: () => true, colourAt: () => grey(9) });

    expect(
      colourAround({
        objects: full.mask,
        isBackground: () => false,
        pixels: full.pixels,
        width: 5,
        height: 5,
      }),
    ).toEqual([Infinity, Infinity, Infinity]);
  });
});
