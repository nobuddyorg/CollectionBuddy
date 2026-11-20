import { describe, expect, it } from 'vitest';

import {
  ARROW_SHIFTS,
  initialFrame,
  keepsWholePhoto,
  keyStep,
  lockedFrame,
  movedFrame,
  pixelBox,
  resizedFrame,
} from './manualCropFrame';

const PHOTO = { width: 1000, height: 600 };
const FRAME = { x: 100, y: 100, width: 200, height: 150 };

describe('initialFrame', () => {
  it('starts free at nine tenths of the photo, centred, so every handle is clear of its edge', () => {
    expect(initialFrame(PHOTO, false)).toEqual({
      x: 50,
      y: 30,
      width: 900,
      height: 540,
    });
  });

  it('starts locked at the largest 4:3 inside those nine tenths', () => {
    expect(initialFrame(PHOTO, true)).toEqual({
      x: 140,
      y: 30,
      width: 720,
      height: 540,
    });
  });

  it('fits a tall photo’s 4:3 frame by its width', () => {
    expect(initialFrame({ width: 600, height: 1000 }, true)).toEqual({
      x: 30,
      y: 297.5,
      width: 540,
      height: 405,
    });
  });
});

describe('lockedFrame', () => {
  it('narrows a wide frame to 4:3 about its centre', () => {
    expect(lockedFrame({ x: 0, y: 0, width: 800, height: 300 })).toEqual({
      x: 200,
      y: 0,
      width: 400,
      height: 300,
    });
  });

  it('shortens a tall frame to 4:3 about its centre', () => {
    expect(lockedFrame({ x: 0, y: 0, width: 300, height: 900 })).toEqual({
      x: 0,
      y: 337.5,
      width: 300,
      height: 225,
    });
  });
});

describe('movedFrame', () => {
  it('moves the frame by the drag, keeping its size', () => {
    expect(movedFrame(FRAME, { x: 50, y: -30 }, PHOTO)).toEqual({
      x: 150,
      y: 70,
      width: 200,
      height: 150,
    });
  });

  it('stops at the photo’s far edges', () => {
    expect(movedFrame(FRAME, { x: 2000, y: 2000 }, PHOTO)).toMatchObject({
      x: 800,
      y: 450,
    });
  });

  it('stops at its near edges', () => {
    expect(movedFrame(FRAME, { x: -500, y: -500 }, PHOTO)).toMatchObject({
      x: 0,
      y: 0,
    });
  });
});

describe('resizedFrame, free', () => {
  const free = { size: PHOTO, locked: false };

  it('drags the bottom-right corner, the top-left one staying put', () => {
    expect(
      resizedFrame(FRAME, {
        ...free,
        corner: 'bottom-right',
        by: { x: 50, y: 20 },
      }),
    ).toEqual({ x: 100, y: 100, width: 250, height: 170 });
  });

  it('drags the top-left corner, the bottom-right one staying put', () => {
    expect(
      resizedFrame(FRAME, {
        ...free,
        corner: 'top-left',
        by: { x: -50, y: -20 },
      }),
    ).toEqual({ x: 50, y: 80, width: 250, height: 170 });
  });

  it('drags the top-right corner, the bottom-left one staying put', () => {
    expect(
      resizedFrame(FRAME, {
        ...free,
        corner: 'top-right',
        by: { x: 10, y: -10 },
      }),
    ).toEqual({ x: 100, y: 90, width: 210, height: 160 });
  });

  it('drags the bottom-left corner, the top-right one staying put', () => {
    expect(
      resizedFrame(FRAME, {
        ...free,
        corner: 'bottom-left',
        by: { x: -10, y: 10 },
      }),
    ).toEqual({ x: 90, y: 100, width: 210, height: 160 });
  });

  it('stops at the photo’s edge', () => {
    expect(
      resizedFrame(FRAME, {
        ...free,
        corner: 'bottom-right',
        by: { x: 5000, y: 5000 },
      }),
    ).toEqual({ x: 100, y: 100, width: 900, height: 500 });
    expect(
      resizedFrame(FRAME, {
        ...free,
        corner: 'top-left',
        by: { x: -5000, y: -5000 },
      }),
    ).toEqual({ x: 0, y: 0, width: 300, height: 250 });
  });

  it('never shrinks below a twentieth of the photo’s shorter side, nor turns inside out', () => {
    expect(
      resizedFrame(FRAME, {
        ...free,
        corner: 'bottom-right',
        by: { x: -1000, y: -1000 },
      }),
    ).toEqual({ x: 100, y: 100, width: 30, height: 30 });
  });

  it('keeps the minimum side within the room an anchor at the edge leaves', () => {
    const atEdge = { x: 990, y: 590, width: 10, height: 10 };

    expect(
      resizedFrame(atEdge, {
        ...free,
        corner: 'bottom-right',
        by: { x: -5, y: -5 },
      }),
    ).toEqual({ x: 990, y: 590, width: 10, height: 10 });
  });
});

describe('resizedFrame, locked to 4:3', () => {
  const locked = { size: PHOTO, locked: true };

  it('lets a wider drag lead, the height following at 4:3', () => {
    expect(
      resizedFrame(FRAME, {
        ...locked,
        corner: 'bottom-right',
        by: { x: 100, y: 0 },
      }),
    ).toEqual({ x: 100, y: 100, width: 300, height: 225 });
  });

  it('lets a taller drag lead, the width following at 4:3', () => {
    expect(
      resizedFrame(FRAME, {
        ...locked,
        corner: 'bottom-right',
        by: { x: 0, y: 150 },
      }),
    ).toEqual({ x: 100, y: 100, width: 400, height: 300 });
  });

  it('grows from the fixed corner upwards and leftwards too', () => {
    expect(
      resizedFrame(FRAME, {
        ...locked,
        corner: 'top-left',
        by: { x: -100, y: 0 },
      }),
    ).toEqual({ x: 0, y: 25, width: 300, height: 225 });
  });

  it('stops where either side meets the photo’s edge, still at 4:3', () => {
    const frame = resizedFrame(FRAME, {
      ...locked,
      corner: 'bottom-right',
      by: { x: 2000, y: 0 },
    });

    expect(frame.x).toBe(100);
    expect(frame.y).toBe(100);
    expect(frame.height).toBe(500);
    expect(frame.width).toBeCloseTo(2000 / 3);
  });

  it('never shrinks below its minimum, still at 4:3', () => {
    expect(
      resizedFrame(FRAME, {
        ...locked,
        corner: 'bottom-right',
        by: { x: -1000, y: -1000 },
      }),
    ).toEqual({ x: 100, y: 100, width: 40, height: 30 });
  });

  it('keeps that minimum within the room an anchor at the edge leaves', () => {
    const atEdge = { x: 980, y: 585, width: 20, height: 15 };

    expect(
      resizedFrame(atEdge, {
        ...locked,
        corner: 'bottom-right',
        by: { x: -5, y: -5 },
      }),
    ).toEqual({ x: 980, y: 585, width: 20, height: 15 });
  });
});

describe('pixelBox', () => {
  it('rounds the frame to whole pixels of the photo', () => {
    expect(
      pixelBox({ x: 10.4, y: 20.6, width: 100.5, height: 50.4 }, PHOTO),
    ).toEqual({ x: 10, y: 21, width: 101, height: 50 });
  });

  it('cuts nothing past the photo’s far edge', () => {
    expect(pixelBox({ x: 990.7, y: 0, width: 50, height: 10 }, PHOTO)).toEqual({
      x: 991,
      y: 0,
      width: 9,
      height: 10,
    });
  });

  it('starts no frame before the photo, and keeps at least one pixel each way', () => {
    expect(pixelBox({ x: -3, y: -2, width: 1.2, height: 0.3 }, PHOTO)).toEqual({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    });
  });

  it('starts no frame past the photo’s last pixel', () => {
    expect(pixelBox({ x: 1200, y: 700, width: 10, height: 10 }, PHOTO)).toEqual(
      { x: 999, y: 599, width: 1, height: 1 },
    );
  });
});

describe('keepsWholePhoto', () => {
  it('calls a frame of the whole photo nothing to crop', () => {
    expect(keepsWholePhoto({ x: 0, y: 0, ...PHOTO }, PHOTO)).toBe(true);
  });

  it('judges by the pixels the crop would cut, not by fractions of one', () => {
    expect(
      keepsWholePhoto({ x: 0.2, y: 0.3, width: 999.6, height: 599.6 }, PHOTO),
    ).toBe(true);
  });

  it('calls a frame trimming either side a crop', () => {
    expect(
      keepsWholePhoto({ x: 0, y: 0, width: 990, height: 600 }, PHOTO),
    ).toBe(false);
    expect(
      keepsWholePhoto({ x: 0, y: 0, width: 1000, height: 590 }, PHOTO),
    ).toBe(false);
  });
});

describe('the arrow keys', () => {
  it('move one step in the arrow’s direction, and only the arrows do', () => {
    expect(ARROW_SHIFTS).toEqual({
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    });
    expect(ARROW_SHIFTS.Enter).toBeUndefined();
  });

  it('step a hundredth of the photo’s longer side, a tenth with Shift', () => {
    expect(keyStep(PHOTO, false)).toBe(10);
    expect(keyStep(PHOTO, true)).toBe(100);
    expect(keyStep({ width: 300, height: 800 }, false)).toBe(8);
  });
});
