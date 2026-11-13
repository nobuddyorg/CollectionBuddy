import { beforeEach, describe, expect, it, vi } from 'vitest';

import { measureOffscreen, scoreOf } from './sharpnessJob';

const canvasSizes: number[][] = [];
const canvasesMade: FakeOffscreenCanvas[] = [];
const close = vi.fn();
const getContextOptions: unknown[] = [];

/** Pixels a hard vertical step would read back as: black on the left, white from the middle on. */
function stepPixels(width: number, height: number) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = x < width / 2 ? 0 : 255;
      rgba.set([value, value, value, 255], (y * width + x) * 4);
    }
  }
  return rgba;
}

/** Just enough of an OffscreenCanvas for drawFitted to draw on and scoreOf to read back. */
class FakeOffscreenCanvas {
  context = {
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    canvas: this,
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
      data: stepPixels(w, h),
    })),
  };
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    canvasSizes.push([width, height]);
    canvasesMade.push(this);
  }
  getContext(contextId: string, options?: unknown) {
    getContextOptions.push(options);
    return contextId === '2d' ? this.context : null;
  }
}

beforeEach(() => {
  canvasSizes.length = 0;
  canvasesMade.length = 0;
  getContextOptions.length = 0;
  close.mockClear();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 4000, height: 3000, close })),
  );
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  return () => vi.unstubAllGlobals();
});

describe('measureOffscreen', () => {
  it('judges the photo at the full-size derivative, 1000 px on its longest side', async () => {
    await measureOffscreen({ kind: 'sharpness', file: new Blob(['photo']) });

    expect(canvasSizes).toEqual([[1000, 750]]);
  });

  it('scores the pixels it drew: a hard step reads as sharp', async () => {
    const score = await measureOffscreen({
      kind: 'sharpness',
      file: new Blob(['photo']),
    });

    expect(score).toBeGreaterThan(100);
  });

  it('decodes the file itself, so the browser applies its EXIF orientation, and releases the bitmap', async () => {
    const file = new Blob(['photo']);

    await measureOffscreen({ kind: 'sharpness', file });

    expect(createImageBitmap).toHaveBeenCalledWith(file);
    expect(close).toHaveBeenCalledOnce();
  });

  it('asks for a canvas it may read back often', async () => {
    await measureOffscreen({ kind: 'sharpness', file: new Blob(['photo']) });

    expect(getContextOptions[0]).toEqual({ willReadFrequently: true });
  });

  it('paints no white backdrop first, as it would for a JPEG', async () => {
    await measureOffscreen({ kind: 'sharpness', file: new Blob(['photo']) });

    expect(canvasesMade[0].context.drawImage).toHaveBeenCalledOnce();
    expect(canvasesMade[0].context.fillRect).not.toHaveBeenCalled();
  });

  it('releases the bitmap when drawing fails, and rejects', async () => {
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return null;
        }
      },
    );

    await expect(
      measureOffscreen({ kind: 'sharpness', file: new Blob(['photo']) }),
    ).rejects.toThrow('This browser has no 2D canvas to draw on');
    expect(close).toHaveBeenCalledOnce();
  });
});

describe('scoreOf', () => {
  it('reads the whole canvas back and scores it', () => {
    const canvas = new FakeOffscreenCanvas(70, 70);

    const score = scoreOf(
      canvas.context as unknown as OffscreenCanvasRenderingContext2D,
    );

    expect(canvas.context.getImageData).toHaveBeenCalledWith(0, 0, 70, 70);
    expect(score).toBeGreaterThan(100);
  });
});
