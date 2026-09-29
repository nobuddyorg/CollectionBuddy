import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type CompressionRequest, drawFitted } from './drawPhoto';
import type { Dimensions } from './photoDimensions';

const close = vi.fn();
const bitmap = { width: 3000, height: 2000, close };
const canvas = {} as OffscreenCanvas;

/** Records every call and property write on the 2D context, in order; its `canvas` is `canvas`. */
function recordingContext() {
  const calls: unknown[][] = [];
  const context = new Proxy(
    {},
    {
      get: (_, name) =>
        name === 'canvas'
          ? canvas
          : (...args: unknown[]) => calls.push([name, ...args]),
      set: (_, name, value) => {
        calls.push([name, value]);
        return true;
      },
    },
  );
  return { calls, context };
}

/** Hands out `context` for whatever size is asked for. */
function contextFor(context: unknown) {
  return vi.fn<(size: Dimensions) => OffscreenCanvasRenderingContext2D | null>(
    () => context as OffscreenCanvasRenderingContext2D | null,
  );
}

const request = (type: string): CompressionRequest => ({
  file: new Blob(['photo']),
  maxWidthOrHeight: 1000,
  type,
  quality: 0.8,
});

beforeEach(() => {
  close.mockClear();
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => bitmap),
  );
  return () => vi.unstubAllGlobals();
});

describe('drawFitted', () => {
  it('decodes the file itself, so the browser applies its EXIF orientation', async () => {
    const { context } = recordingContext();
    const { file } = request('image/webp');

    await drawFitted({ ...request('image/webp'), file }, contextFor(context));

    expect(createImageBitmap).toHaveBeenCalledWith(file);
  });

  it('draws the whole photograph, smoothed at high quality, onto a canvas fitted within the longest side', async () => {
    const { calls, context } = recordingContext();
    const contextOfSize = contextFor(context);

    const drawn = await drawFitted(request('image/webp'), contextOfSize);

    expect(contextOfSize).toHaveBeenCalledWith({ width: 1000, height: 667 });
    expect(drawn).toBe(canvas);
    expect(calls).toEqual([
      ['imageSmoothingQuality', 'high'],
      ['drawImage', bitmap, 0, 0, 1000, 667],
    ]);
  });

  // JPEG has no alpha: without the fill, a transparent PNG's background would come out black.
  it('lays the photograph on white first when it will be encoded as JPEG', async () => {
    const { calls, context } = recordingContext();

    await drawFitted(request('image/jpeg'), contextFor(context));

    expect(calls).toEqual([
      ['imageSmoothingQuality', 'high'],
      ['fillStyle', 'white'],
      ['fillRect', 0, 0, 1000, 667],
      ['drawImage', bitmap, 0, 0, 1000, 667],
    ]);
  });

  it('releases the decoded bitmap once drawn', async () => {
    const { context } = recordingContext();

    await drawFitted(request('image/webp'), contextFor(context));

    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects where the browser has no 2D canvas, and still releases the bitmap', async () => {
    await expect(
      drawFitted(request('image/webp'), contextFor(null)),
    ).rejects.toThrow('This browser has no 2D canvas to draw on');
    expect(close).toHaveBeenCalledOnce();
  });
});
