import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  drawRotated,
  inspectOffscreen,
  inspectPixels,
  pixelsOf,
  rotateOffscreen,
  type ContextOfSize,
} from './rotationJob';

/** RGBA for `width` × `height` pixels, opaque or with a see-through first pixel. */
function rgba(
  { width, height }: { width: number; height: number },
  alphaAt: (index: number) => number = () => 255,
) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    pixels[index * 4 + 3] = alphaAt(index);
  }
  return pixels;
}

/** Records what a 2D context is asked to do; `getImageData` answers with `pixels`. */
function fakeContext(pixels = new Uint8ClampedArray(4)) {
  const canvas = { convertToBlob: vi.fn(async () => new Blob(['png'])) };
  return {
    canvas,
    imageSmoothingQuality: 'low',
    drawImage: vi.fn(),
    setTransform: vi.fn(),
    getImageData: vi.fn(() => ({ data: pixels })),
  };
}

type FakeContext = ReturnType<typeof fakeContext>;

/** A context maker that records each size asked for and hands out `contexts` in turn. */
function contextsOf(...contexts: (FakeContext | null)[]) {
  const sizes: { width: number; height: number }[] = [];
  const contextOfSize = ((size) => {
    sizes.push(size);
    return contexts.shift() ?? null;
  }) as ContextOfSize<CanvasRenderingContext2D>;
  return { sizes, contextOfSize };
}

const LANDSCAPE = { width: 40, height: 30 };
const photo = { ...LANDSCAPE } as unknown as CanvasImageSource &
  typeof LANDSCAPE;

describe('pixelsOf', () => {
  it('draws the photo at its own size and reads every pixel back', () => {
    const pixels = rgba(LANDSCAPE);
    const context = fakeContext(pixels);
    const { sizes, contextOfSize } = contextsOf(context);

    expect(pixelsOf(photo, contextOfSize)).toBe(pixels);
    expect(sizes).toEqual([LANDSCAPE]);
    expect(context.drawImage).toHaveBeenCalledWith(photo, 0, 0);
    expect(context.getImageData).toHaveBeenCalledWith(0, 0, 40, 30);
  });

  it('fails plainly where the browser has no 2D canvas', () => {
    expect(() => pixelsOf(photo, contextsOf(null).contextOfSize)).toThrow(
      'This browser has no 2D canvas to draw on',
    );
  });
});

describe('inspectPixels', () => {
  it('calls an opaque photo no cut-out, with nothing to straighten', () => {
    expect(inspectPixels(rgba(LANDSCAPE), LANDSCAPE)).toEqual({
      transparent: false,
      straightening: { kind: 'none' },
    });
  });

  it('calls a photo with a see-through pixel a cut-out, and reads its outline', () => {
    const size = { width: 4, height: 4 };
    // An upright 2 × 2 square in the middle: square already.
    const square = rgba(size, (index) =>
      [5, 6, 9, 10].includes(index) ? 255 : 0,
    );
    expect(inspectPixels(square, size)).toEqual({
      transparent: true,
      straightening: { kind: 'none' },
    });
  });
});

describe('drawRotated', () => {
  it('crops an opaque photo, turned about its centre, on a canvas of the crop’s size', () => {
    const context = fakeContext();
    const { sizes, contextOfSize } = contextsOf(context);

    const canvas = drawRotated(photo, {
      degrees: 90,
      transparent: false,
      contextOfSize,
    });

    expect(canvas).toBe(context.canvas);
    expect(sizes).toEqual([{ width: 30, height: 40 }]);
    expect(context.setTransform).toHaveBeenCalledWith(0, 1, -1, 0, 30, 0);
    expect(context.drawImage).toHaveBeenCalledWith(photo, 0, 0);
    expect(context.imageSmoothingQuality).toBe('high');
  });

  it('keeps all of a cut-out, on a canvas grown to hold it', () => {
    const { sizes, contextOfSize } = contextsOf(fakeContext());

    drawRotated(photo, { degrees: 30, transparent: true, contextOfSize });

    // 40·cos30 + 30·sin30 = 49.6; 40·sin30 + 30·cos30 = 46.0
    expect(sizes).toEqual([{ width: 50, height: 46 }]);
  });

  it('fails plainly where the browser has no 2D canvas', () => {
    expect(() =>
      drawRotated(photo, {
        degrees: 90,
        transparent: false,
        contextOfSize: contextsOf(null).contextOfSize,
      }),
    ).toThrow('This browser has no 2D canvas to draw on');
  });
});

describe('on an OffscreenCanvas', () => {
  const close = vi.fn();
  let contexts: FakeContext[] = [];
  const canvasSizes: number[][] = [];
  const contextOptions: unknown[] = [];

  class FakeOffscreenCanvas {
    constructor(width: number, height: number) {
      canvasSizes.push([width, height]);
    }
    getContext(id: string, options: unknown) {
      contextOptions.push([id, options]);
      return contexts.shift() ?? null;
    }
  }

  beforeEach(() => {
    close.mockClear();
    canvasSizes.length = 0;
    contextOptions.length = 0;
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ ...LANDSCAPE, close })),
    );
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    return () => vi.unstubAllGlobals();
  });

  it('inspects the decoded photo and releases its bitmap', async () => {
    contexts = [
      fakeContext(rgba(LANDSCAPE, (index) => (index === 0 ? 0 : 255))),
    ];
    const file = new Blob(['photo']);

    const inspection = await inspectOffscreen({
      kind: 'inspect-rotation',
      file,
    });

    expect(inspection.transparent).toBe(true);
    expect(createImageBitmap).toHaveBeenCalledWith(file);
    expect(canvasSizes).toEqual([[40, 30]]);
    // Read back once: a hint the browser keeps the pixels on the CPU.
    expect(contextOptions).toEqual([['2d', { willReadFrequently: true }]]);
    expect(close).toHaveBeenCalledOnce();
  });

  it('turns an opaque photo, cropped, and hands it back as PNG', async () => {
    const turned = fakeContext();
    contexts = [fakeContext(rgba(LANDSCAPE)), turned];

    const rotated = await rotateOffscreen({
      kind: 'rotate',
      file: new Blob(['photo']),
      degrees: -90,
    });

    expect(rotated.transparent).toBe(false);
    expect(await rotated.blob.text()).toBe('png');
    expect(canvasSizes).toEqual([
      [40, 30],
      [30, 40],
    ]);
    expect(turned.canvas.convertToBlob).toHaveBeenCalledWith({
      type: 'image/png',
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('keeps a cut-out whole and says it is one', async () => {
    contexts = [
      fakeContext(rgba(LANDSCAPE, (index) => (index === 0 ? 0 : 255))),
      fakeContext(),
    ];

    const rotated = await rotateOffscreen({
      kind: 'rotate',
      file: new Blob(['photo']),
      degrees: 30,
    });

    expect(rotated.transparent).toBe(true);
    expect(canvasSizes[1]).toEqual([50, 46]);
  });

  it('still releases the bitmap when drawing fails', async () => {
    contexts = [];

    await expect(
      rotateOffscreen({
        kind: 'rotate',
        file: new Blob(['photo']),
        degrees: 90,
      }),
    ).rejects.toThrow('This browser has no 2D canvas to draw on');
    expect(close).toHaveBeenCalledOnce();
  });
});
