import { describe, expect, it, vi } from 'vitest';

import { drawFitted } from './drawPhoto';
import type { Dimensions } from './photoDimensions';

const photo = { width: 3000, height: 2000 } as ImageBitmap;
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

describe('drawFitted', () => {
  it('draws the whole photograph, smoothed at high quality, onto a canvas fitted within the longest side', () => {
    const { calls, context } = recordingContext();
    const contextOfSize = contextFor(context);

    const drawn = drawFitted(photo, {
      maxWidthOrHeight: 1000,
      type: 'image/webp',
      contextOfSize,
    });

    expect(contextOfSize).toHaveBeenCalledWith({ width: 1000, height: 667 });
    expect(drawn).toBe(canvas);
    expect(calls).toEqual([
      ['imageSmoothingQuality', 'high'],
      ['drawImage', photo, 0, 0, 1000, 667],
    ]);
  });

  // JPEG has no alpha: without the fill, a transparent PNG's background would come out black.
  it('lays the photograph on white first when it will be encoded as JPEG', () => {
    const { calls, context } = recordingContext();

    drawFitted(photo, {
      maxWidthOrHeight: 600,
      type: 'image/jpeg',
      contextOfSize: contextFor(context),
    });

    expect(calls).toEqual([
      ['imageSmoothingQuality', 'high'],
      ['fillStyle', 'white'],
      ['fillRect', 0, 0, 600, 400],
      ['drawImage', photo, 0, 0, 600, 400],
    ]);
  });

  it('throws where the browser has no 2D canvas', () => {
    expect(() =>
      drawFitted(photo, {
        maxWidthOrHeight: 1000,
        type: 'image/webp',
        contextOfSize: contextFor(null),
      }),
    ).toThrow('This browser has no 2D canvas to draw on');
  });
});
