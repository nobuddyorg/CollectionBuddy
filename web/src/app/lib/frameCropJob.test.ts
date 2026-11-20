import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { cropFrameOffscreen, drawFramed } from './frameCropJob';
import type { ContextOfSize } from './rotationJob';

const PHOTO = { width: 4, height: 3 };

/** RGBA for the photo: each pixel's red channel is its index, opaque unless `alphaAt` says otherwise. */
function rgba(alphaAt: (index: number) => number = () => 255) {
  const pixels = new Uint8ClampedArray(PHOTO.width * PHOTO.height * 4);
  for (let index = 0; index < PHOTO.width * PHOTO.height; index += 1) {
    pixels[index * 4] = index;
    pixels[index * 4 + 3] = alphaAt(index);
  }
  return pixels;
}

class FakeImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

/** Records what a 2D context is asked to do; `getImageData` answers with `pixels`. */
function fakeContext(pixels: Uint8ClampedArray) {
  return {
    canvas: { convertToBlob: vi.fn(async () => new Blob(['png'])) },
    drawImage: vi.fn(),
    getImageData: vi.fn(() => ({ data: pixels })),
    putImageData: vi.fn(),
  };
}

type FakeContext = ReturnType<typeof fakeContext>;

/** Hands out `contexts` in turn, recording the size each was asked for. */
function contextsOf(...contexts: (FakeContext | null)[]) {
  const sizes: { width: number; height: number }[] = [];
  const contextOfSize = ((size) => {
    sizes.push(size);
    return contexts.shift() ?? null;
  }) as ContextOfSize<CanvasRenderingContext2D>;
  return { sizes, contextOfSize };
}

const photo = { ...PHOTO } as unknown as CanvasImageSource & typeof PHOTO;

beforeEach(() => {
  vi.stubGlobal('ImageData', FakeImageData);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('drawFramed', () => {
  it('cuts exactly the pixels inside the frame onto a canvas of its size', () => {
    const source = fakeContext(rgba());
    const target = fakeContext(new Uint8ClampedArray(0));
    const { sizes, contextOfSize } = contextsOf(source, target);

    const { canvas, transparent } = drawFramed(photo, {
      box: { x: 1, y: 1, width: 2, height: 2 },
      contextOfSize,
    });

    expect(sizes).toEqual([PHOTO, { x: 1, y: 1, width: 2, height: 2 }]);
    const [image] = target.putImageData.mock.calls[0] as [FakeImageData];
    expect(image).toMatchObject({ width: 2, height: 2 });
    // Pixels 5, 6 of the second row and 9, 10 of the third.
    expect(
      Array.from(image.data).filter((_, index) => index % 4 === 0),
    ).toEqual([5, 6, 9, 10]);
    expect(canvas).toBe(target.canvas);
    expect(transparent).toBe(false);
  });

  it('holds a frame reaching past the photo to its pixels', () => {
    const target = fakeContext(new Uint8ClampedArray(0));
    const { sizes, contextOfSize } = contextsOf(fakeContext(rgba()), target);

    drawFramed(photo, {
      box: { x: 2.6, y: -1, width: 10, height: 10 },
      contextOfSize,
    });

    expect(sizes[1]).toEqual({ x: 3, y: 0, width: 1, height: 3 });
  });

  it('keeps a cut-out see-through where the frame takes in its transparency', () => {
    const { contextOfSize } = contextsOf(
      fakeContext(rgba((index) => (index === 5 ? 0 : 255))),
      fakeContext(new Uint8ClampedArray(0)),
    );

    expect(
      drawFramed(photo, {
        box: { x: 1, y: 1, width: 2, height: 2 },
        contextOfSize,
      }).transparent,
    ).toBe(true);
  });

  it('crops a cut-out to opaque pixels alone as an opaque photo', () => {
    const { contextOfSize } = contextsOf(
      fakeContext(rgba((index) => (index === 0 ? 0 : 255))),
      fakeContext(new Uint8ClampedArray(0)),
    );

    expect(
      drawFramed(photo, {
        box: { x: 1, y: 1, width: 2, height: 2 },
        contextOfSize,
      }).transparent,
    ).toBe(false);
  });

  it('fails plainly where the browser has no 2D canvas for the crop', () => {
    const { contextOfSize } = contextsOf(fakeContext(rgba()), null);

    expect(() =>
      drawFramed(photo, {
        box: { x: 0, y: 0, width: 1, height: 1 },
        contextOfSize,
      }),
    ).toThrow('This browser has no 2D canvas to draw on');
  });
});

describe('on an OffscreenCanvas', () => {
  const bitmap = { ...PHOTO, close: vi.fn() };
  let contexts: FakeContext[] = [];

  beforeEach(() => {
    bitmap.close.mockClear();
    contexts = [fakeContext(rgba()), fakeContext(new Uint8ClampedArray(0))];
    const handed = [...contexts];
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          return handed.shift();
        }
      },
    );
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => bitmap),
    );
  });

  it('crops the decoded photo to the frame as PNG, and releases its bitmap', async () => {
    const file = new Blob(['stored']);

    const cropped = await cropFrameOffscreen({
      kind: 'crop-frame',
      file,
      box: { x: 0, y: 0, width: 2, height: 3 },
    });

    expect(createImageBitmap).toHaveBeenCalledWith(file);
    expect(contexts[1].canvas.convertToBlob).toHaveBeenCalledWith({
      type: 'image/png',
    });
    expect(await cropped.blob.text()).toBe('png');
    expect(cropped.transparent).toBe(false);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('still releases the bitmap when the crop fails', async () => {
    contexts[1].canvas.convertToBlob.mockRejectedValue(new Error('no memory'));

    await expect(
      cropFrameOffscreen({
        kind: 'crop-frame',
        file: new Blob(['stored']),
        box: { x: 0, y: 0, width: 1, height: 1 },
      }),
    ).rejects.toThrow('no memory');
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});
