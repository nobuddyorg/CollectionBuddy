import { describe, expect, it } from 'vitest';

import {
  cropPixels,
  GRID_ASPECT,
  isFramedAlready,
  marginFrame,
  objectFrame,
} from './cropFrame';

const PHOTO = { width: 1000, height: 750 };

describe('objectFrame', () => {
  it('grows the object by its margin, then heightens a wide box to the grid’s 4:3', () => {
    // 200 × 100 at (400, 300): 20 of margin all round makes 240 × 140, heightened to 240 × 180.
    expect(
      objectFrame({
        bounds: { x: 400, y: 300, width: 200, height: 100 },
        size: PHOTO,
        margin: 0.1,
      }),
    ).toEqual({ x: 380, y: 260, width: 240, height: 180 });
  });

  it('widens a tall box to 4:3 instead, about the object’s centre', () => {
    // 100 × 300 at (450, 200), no margin: widened to 400 × 300.
    expect(
      objectFrame({
        bounds: { x: 450, y: 200, width: 100, height: 300 },
        size: PHOTO,
        margin: 0,
      }),
    ).toEqual({ x: 300, y: 200, width: 400, height: 300 });
  });

  it('keeps a box already 4:3 as it is', () => {
    expect(
      objectFrame({
        bounds: { x: 100, y: 100, width: 400, height: 300 },
        size: PHOTO,
        margin: 0,
      }),
    ).toEqual({ x: 100, y: 100, width: 400, height: 300 });
  });

  it('takes the grid’s aspect unless told another', () => {
    expect(GRID_ASPECT).toBe(4 / 3);
    expect(
      objectFrame({
        bounds: { x: 400, y: 300, width: 100, height: 100 },
        size: PHOTO,
        margin: 0,
        aspect: 1,
      }),
    ).toEqual({ x: 400, y: 300, width: 100, height: 100 });
  });

  it('slides a frame that would cross the photo’s edge back inside it', () => {
    // 80 × 60 with 20 of margin is 120 × 100, widened to 133 × 100; in the top-left corner it starts at the corner.
    expect(
      objectFrame({
        bounds: { x: 0, y: 0, width: 80, height: 60 },
        size: PHOTO,
        margin: 0.25,
      }),
    ).toEqual({ x: 0, y: 0, width: 133, height: 100 });
    // And in the bottom-right one.
    expect(
      objectFrame({
        bounds: { x: 920, y: 690, width: 80, height: 60 },
        size: PHOTO,
        margin: 0.25,
      }),
    ).toEqual({ x: 867, y: 650, width: 133, height: 100 });
  });

  it('never grows the frame past the photo, the aspect giving way', () => {
    // A wide object across a tall photo: heightening it to 4:3 would need more than the photo has.
    expect(
      objectFrame({
        bounds: { x: 0, y: 450, width: 600, height: 100 },
        size: { width: 600, height: 300 },
        margin: 0,
      }),
    ).toEqual({ x: 0, y: 0, width: 600, height: 300 });
  });

  it('rounds the frame to whole pixels', () => {
    const frame = objectFrame({
      bounds: { x: 101, y: 101, width: 33, height: 7 },
      size: PHOTO,
      margin: 0.1,
    });
    for (const value of Object.values(frame)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });
});

// A cut-out's frame: transparent past the photo's edge, so nothing holds it inside.
describe('marginFrame', () => {
  it('grows the object by its margin, then to the grid’s 4:3, about its centre', () => {
    expect(
      marginFrame({
        bounds: { x: 400, y: 300, width: 200, height: 100 },
        margin: 0.1,
      }),
    ).toEqual({ x: 380, y: 260, width: 240, height: 180 });
  });

  it('reaches past the photo’s edge rather than sliding off the object’s centre', () => {
    expect(
      marginFrame({
        bounds: { x: 0, y: 0, width: 80, height: 60 },
        margin: 0.25,
      }),
    ).toEqual({ x: -26, y: -20, width: 133, height: 100 });
  });

  it('takes another aspect when told one', () => {
    expect(
      marginFrame({
        bounds: { x: 10, y: 10, width: 30, height: 10 },
        margin: 0,
        aspect: 1,
      }),
    ).toEqual({ x: 10, y: 0, width: 30, height: 30 });
  });

  it('is the frame a crop takes wherever that fits inside the photo', () => {
    const bounds = { x: 300, y: 250, width: 170, height: 90 };

    expect(marginFrame({ bounds, margin: 0.08 })).toEqual(
      objectFrame({ bounds, size: PHOTO, margin: 0.08 }),
    );
  });
});

describe('isFramedAlready', () => {
  it('calls a frame of the photo’s own size framed already', () => {
    expect(isFramedAlready({ x: 0, y: 0, ...PHOTO }, PHOTO)).toBe(true);
  });

  it('calls a frame keeping 98% of both sides framed already: a crop of a crop trims nothing', () => {
    expect(
      isFramedAlready({ x: 10, y: 7, width: 980, height: 735 }, PHOTO),
    ).toBe(true);
  });

  it('calls a frame trimming more than that off either side a crop', () => {
    expect(
      isFramedAlready({ x: 0, y: 0, width: 979, height: 750 }, PHOTO),
    ).toBe(false);
    expect(
      isFramedAlready({ x: 0, y: 0, width: 1000, height: 734 }, PHOTO),
    ).toBe(false);
  });
});

describe('cropPixels', () => {
  it('copies the RGBA inside the box, row by row', () => {
    // 3 × 2 pixels, each one's red its index.
    const pixels = new Uint8ClampedArray(
      Array.from({ length: 6 }, (_, index) => [index, 9, 9, 255]).flat(),
    );

    const cropped = cropPixels({
      pixels,
      size: { width: 3, height: 2 },
      box: { x: 1, y: 0, width: 2, height: 2 },
    });

    expect(Array.from(cropped.filter((_, index) => index % 4 === 0))).toEqual([
      1, 2, 4, 5,
    ]);
    expect(cropped).toHaveLength(16);
  });
});
