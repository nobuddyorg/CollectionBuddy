// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FrameCropAnswer } from './frameCropJob';
import { cropPhotoToFrame } from './photoFrameCrop';

/** Stands in for the photo worker: records what it is sent and answers as the test says. */
class FakeWorker {
  static started: FakeWorker[] = [];
  static reply: (worker: FakeWorker) => void = () => {};
  readonly sent: unknown[] = [];
  terminated = false;
  private readonly listeners = new Map<string, (event: unknown) => void>();

  constructor(readonly url: URL) {
    FakeWorker.started.push(this);
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    this.listeners.set(type, listener);
  }
  postMessage(message: unknown) {
    this.sent.push(message);
    queueMicrotask(() => FakeWorker.reply(this));
  }
  terminate() {
    this.terminated = true;
  }
  answer(data: FrameCropAnswer) {
    this.listeners.get('message')?.({ data });
  }
}

class FakeImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

const answersWith = (data: FrameCropAnswer) => {
  FakeWorker.reply = (worker) => worker.answer(data);
};
const stored = () => new Blob(['stored'], { type: 'image/webp' });
const BOX = { x: 0, y: 0, width: 1, height: 1 };

beforeEach(() => {
  FakeWorker.started = [];
  vi.stubGlobal('Worker', FakeWorker);
  vi.stubGlobal('ImageData', FakeImageData);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('where a worker can draw', () => {
  beforeEach(() => {
    vi.stubGlobal('OffscreenCanvas', class {});
  });

  it('crops a cut-out in a photo worker into a PNG upload that stays see-through, and ends it', async () => {
    answersWith({ blob: new Blob(['png']), transparent: true });
    const file = stored();

    const upload = await cropPhotoToFrame(file, BOX);

    expect(FakeWorker.started[0].sent).toEqual([
      { kind: 'crop-frame', file, box: BOX },
    ]);
    expect(FakeWorker.started[0].terminated).toBe(true);
    expect(upload.encoding).toBe('transparent');
    expect(upload.file.type).toBe('image/png');
    expect(upload.file.name).toBe('cropped.png');
    expect(await upload.file.text()).toBe('png');
  });

  it('crops an opaque photo into an opaque upload', async () => {
    answersWith({ blob: new Blob(['png']), transparent: false });

    expect((await cropPhotoToFrame(stored(), BOX)).encoding).toBe('opaque');
  });

  it('rejects with the worker’s reason when the crop fails', async () => {
    answersWith({ error: 'EncodingError: undecodable' });

    await expect(cropPhotoToFrame(stored(), BOX)).rejects.toThrow(
      'EncodingError: undecodable',
    );
  });
});

describe('where no worker can draw (no OffscreenCanvas)', () => {
  let encoded: Blob | null = new Blob(['png']);
  const contextOptions: unknown[] = [];

  beforeEach(() => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    contextOptions.length = 0;
    encoded = new Blob(['png']);
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: async function (this: HTMLImageElement) {
        Object.defineProperties(this, {
          width: { value: 2 },
          height: { value: 1 },
        });
      },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      function (this: HTMLCanvasElement, _id: string, options?: unknown) {
        contextOptions.push(options);
        return {
          drawImage: vi.fn(),
          // A see-through first pixel, an opaque second: a cut-out.
          getImageData: () => ({
            data: new Uint8ClampedArray([1, 1, 1, 0, 2, 2, 2, 255]),
          }),
          putImageData: vi.fn(),
          canvas: this,
        } as unknown as CanvasRenderingContext2D;
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(
      (callback) => callback(encoded),
    );
  });

  it('crops on the main thread instead, starting no worker, keeping a cut-out see-through', async () => {
    const upload = await cropPhotoToFrame(stored(), {
      x: 0,
      y: 0,
      width: 2,
      height: 1,
    });

    expect(FakeWorker.started).toEqual([]);
    expect(upload.encoding).toBe('transparent');
    expect(upload.file.type).toBe('image/png');
    expect(contextOptions).toContainEqual({ willReadFrequently: true });
  });

  it('crops an opaque part into an opaque upload', async () => {
    const upload = await cropPhotoToFrame(stored(), {
      x: 1,
      y: 0,
      width: 1,
      height: 1,
    });

    expect(upload.encoding).toBe('opaque');
  });

  it('fails plainly when the canvas encodes nothing', async () => {
    encoded = null;

    await expect(cropPhotoToFrame(stored(), BOX)).rejects.toThrow(
      'The canvas encoded nothing',
    );
  });
});
