// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { inspectForRotation, rotatePhoto } from './photoRotation';
import type { InspectionAnswer, RotationAnswer } from './rotationJob';

type Answer = InspectionAnswer | RotationAnswer;

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
  answer(data: Answer) {
    this.listeners.get('message')?.({ data });
  }
}

const answersWith = (data: Answer) => {
  FakeWorker.reply = (worker) => worker.answer(data);
};
const stored = () => new Blob(['stored'], { type: 'image/webp' });

beforeEach(() => {
  FakeWorker.started = [];
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('where a worker can draw', () => {
  beforeEach(() => {
    vi.stubGlobal('OffscreenCanvas', class {});
  });

  it('inspects the photo in a photo worker and ends it', async () => {
    const inspection = {
      transparent: true,
      straightening: { kind: 'straighten', degrees: 4.2 },
    } as const;
    answersWith({ inspection });
    const file = stored();

    expect(await inspectForRotation(file)).toEqual(inspection);
    expect(FakeWorker.started[0].sent).toEqual([
      { kind: 'inspect-rotation', file },
    ]);
    expect(FakeWorker.started[0].terminated).toBe(true);
  });

  it('rejects with the worker’s reason when the inspection fails', async () => {
    answersWith({ error: 'EncodingError: undecodable' });

    await expect(inspectForRotation(stored())).rejects.toThrow(
      'EncodingError: undecodable',
    );
  });

  it('turns a cut-out in a photo worker into a PNG upload that stays see-through', async () => {
    answersWith({ blob: new Blob(['png']), transparent: true });
    const file = stored();

    const upload = await rotatePhoto(file, 92.5);

    expect(FakeWorker.started[0].sent).toEqual([
      { kind: 'rotate', file, degrees: 92.5 },
    ]);
    expect(upload.encoding).toBe('transparent');
    expect(upload.file.type).toBe('image/png');
    expect(upload.file.name).toBe('rotated.png');
    expect(await upload.file.text()).toBe('png');
  });

  it('turns an opaque photo into an opaque upload', async () => {
    answersWith({ blob: new Blob(['png']), transparent: false });

    expect((await rotatePhoto(stored(), 90)).encoding).toBe('opaque');
  });

  it('rejects with the worker’s reason when the rotation fails', async () => {
    answersWith({ error: 'Error: No canvas' });

    await expect(rotatePhoto(stored(), 90)).rejects.toThrow('Error: No canvas');
  });
});

describe('where no worker can draw (no OffscreenCanvas)', () => {
  let pixels = new Uint8ClampedArray(0);
  let encoded: Blob | null = new Blob(['png']);
  let toBlob: ReturnType<typeof vi.spyOn>;
  const setTransform = vi.fn();
  const contextOptions: unknown[] = [];

  beforeEach(() => {
    vi.stubGlobal('OffscreenCanvas', undefined);
    setTransform.mockClear();
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
          setTransform,
          getImageData: () => ({ data: pixels }),
          canvas: this,
        } as unknown as CanvasRenderingContext2D;
      },
    );
    toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((callback) => callback(encoded));
  });
  afterEach(() => {
    Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
  });

  it('inspects the photo on the main thread instead, starting no worker', async () => {
    pixels = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0]);

    expect(await inspectForRotation(stored())).toEqual({
      transparent: true,
      straightening: { kind: 'none' },
    });
    expect(FakeWorker.started).toEqual([]);
    expect(contextOptions[0]).toEqual({ willReadFrequently: true });
  });

  it('turns the photo there too, as PNG, keeping a cut-out see-through', async () => {
    pixels = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 0]);

    const upload = await rotatePhoto(stored(), 90);

    expect(FakeWorker.started).toEqual([]);
    expect(setTransform).toHaveBeenCalledWith(0, 1, -1, 0, 1, 0);
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
    expect(upload.encoding).toBe('transparent');
  });

  it('turns an opaque photo into an opaque upload', async () => {
    pixels = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]);

    expect((await rotatePhoto(stored(), 90)).encoding).toBe('opaque');
  });

  it('fails plainly when the canvas encodes nothing', async () => {
    pixels = new Uint8ClampedArray([0, 0, 0, 255, 0, 0, 0, 255]);
    encoded = null;

    await expect(rotatePhoto(stored(), 90)).rejects.toThrow(
      'The canvas encoded nothing',
    );
  });
});
