// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SharpnessAnswer } from './sharpnessJob';

const scoreOf = vi.hoisted(() => vi.fn<() => number>());
vi.mock('./sharpnessJob', async (importActual) => ({
  ...(await importActual<typeof import('./sharpnessJob')>()),
  scoreOf,
}));

import { assessSharpness } from './photoSharpness';

/** Stands in for the photo worker: records what it is sent and answers as the test says. */
class FakeWorker {
  static started: FakeWorker[] = [];
  static reply: (worker: FakeWorker) => void = () => {};
  readonly sent: unknown[] = [];
  terminated = false;
  private readonly listeners = new Map<string, (event: unknown) => void>();

  constructor(
    readonly url: URL,
    readonly options: WorkerOptions,
  ) {
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
  answer(data: SharpnessAnswer) {
    this.listeners.get('message')?.({ data });
  }
  fail() {
    this.listeners.get('error')?.(new Event('error'));
  }
}

const answersWith = (data: SharpnessAnswer) => {
  FakeWorker.reply = (worker) => worker.answer(data);
};
const photo = () => new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  FakeWorker.started = [];
  vi.stubGlobal('Worker', FakeWorker);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  scoreOf.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('assessSharpness, where a worker can draw', () => {
  beforeEach(() => {
    vi.stubGlobal('OffscreenCanvas', class {});
  });

  it('asks a photo worker to judge the photo, and ends it once it answers', async () => {
    answersWith({ score: 2500 });
    const file = photo();

    await assessSharpness(file);

    expect(FakeWorker.started).toHaveLength(1);
    expect(FakeWorker.started[0].sent).toEqual([{ kind: 'sharpness', file }]);
    expect(FakeWorker.started[0].options).toEqual({ type: 'module' });
    expect(FakeWorker.started[0].terminated).toBe(true);
  });

  it.each([
    [2500, 'sharp'],
    [100, 'sharp'],
    [99.9, 'blurry'],
    [3, 'blurry'],
  ] as const)('reads a score of %d as %s', async (score, verdict) => {
    answersWith({ score });

    expect(await assessSharpness(photo())).toBe(verdict);
  });

  // Advisory only: the upload decodes the photo again and reports a real failure itself.
  it('lets a photo it could not judge through as sharp, and says why in the console', async () => {
    answersWith({
      error: 'EncodingError: The source image cannot be decoded.',
    });

    expect(await assessSharpness(photo())).toBe('sharp');
    expect(warn).toHaveBeenCalledWith(
      'Sharpness check failed:',
      new Error('EncodingError: The source image cannot be decoded.'),
    );
  });

  // A worker file missing after a deploy, or refused by the CSP, never answers at all.
  it('lets the photo through as sharp when the worker itself fails, and ends it', async () => {
    FakeWorker.reply = (worker) => worker.fail();

    expect(await assessSharpness(photo())).toBe('sharp');
    expect(warn).toHaveBeenCalledWith(
      'Sharpness check failed:',
      expect.objectContaining({
        message: 'The photo sharpness worker failed',
      }),
    );
    expect(FakeWorker.started[0].terminated).toBe(true);
  });
});

describe('assessSharpness, where no worker can draw (no OffscreenCanvas)', () => {
  const drawImage = vi.fn();
  const contextOptions: unknown[] = [];

  beforeEach(() => {
    drawImage.mockClear();
    contextOptions.length = 0;
    vi.stubGlobal('OffscreenCanvas', undefined);
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: async function (this: HTMLImageElement) {
        Object.defineProperties(this, {
          width: { value: 4000 },
          height: { value: 3000 },
        });
      },
    });
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      function (this: HTMLCanvasElement, _id: string, options?: unknown) {
        contextOptions.push(options);
        return {
          drawImage,
          fillRect: vi.fn(),
          canvas: this,
        } as unknown as CanvasRenderingContext2D;
      },
    );
  });
  afterEach(() => {
    Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
  });

  it('judges it on the main thread instead, starting no worker', async () => {
    scoreOf.mockReturnValue(5);

    expect(await assessSharpness(photo())).toBe('blurry');
    expect(FakeWorker.started).toEqual([]);
    expect(drawImage).toHaveBeenCalledWith(
      expect.any(HTMLImageElement),
      0,
      0,
      1000,
      750,
    );
    expect(contextOptions[0]).toEqual({ willReadFrequently: true });
  });

  it('reads a sharp score as sharp there too', async () => {
    scoreOf.mockReturnValue(4000);

    expect(await assessSharpness(photo())).toBe('sharp');
  });
});
