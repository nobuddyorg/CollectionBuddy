// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompressionAnswer } from './compressPhoto.worker';

type WorkerReply = (worker: FakeWorker) => void;

/** Stands in for the compression worker: records what it is sent and replies as the test says. */
class FakeWorker {
  static started: FakeWorker[] = [];
  static reply: WorkerReply = () => {};
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

  answer(data: CompressionAnswer) {
    this.listeners.get('message')?.({ data });
  }

  fail() {
    this.listeners.get('error')?.(new Event('error'));
  }
}

const encoded = new Blob(['encoded'], { type: 'image/webp' });
const answersWith = (data: CompressionAnswer) => {
  FakeWorker.reply = (worker) => worker.answer(data);
};

/** jsdom's canvas cannot encode; this one answers each request the way the browser under test would. */
function canvasEncodes(
  answer: (
    type: string | undefined,
    canvas: HTMLCanvasElement,
  ) => string | null,
) {
  return vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation(function (this: HTMLCanvasElement, callback, type) {
      const answered = answer(type, this);
      callback(
        answered === null ? null : new Blob(['encoded'], { type: answered }),
      );
    });
}
const encodesAsAsked = (type: string | undefined) => type ?? 'image/png';
const encodesLikeSafari = (type: string | undefined) =>
  type === 'image/webp' ? 'image/png' : (type ?? 'image/png');

// The probe is cached per module, so each test loads a fresh copy.
async function freshCompressPhoto() {
  vi.resetModules();
  return (await import('./imageCompression')).compressPhoto;
}

const photo = () => new File(['x'], 'photo.jpg', { type: 'image/jpeg' });

beforeEach(() => {
  FakeWorker.started = [];
  answersWith({ blob: encoded });
  vi.stubGlobal('Worker', FakeWorker);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('compressPhoto, where a worker can draw', () => {
  beforeEach(() => {
    vi.stubGlobal('OffscreenCanvas', class {});
  });

  it('asks a worker for WebP at 80% quality within the longest side, where the browser encodes WebP', async () => {
    canvasEncodes(encodesAsAsked);
    const compressPhoto = await freshCompressPhoto();
    const input = photo();

    await compressPhoto(input, 1000);

    expect(FakeWorker.started).toHaveLength(1);
    expect(FakeWorker.started[0].sent).toEqual([
      { file: input, maxWidthOrHeight: 1000, type: 'image/webp', quality: 0.8 },
    ]);
  });

  it('starts the worker as a module from its own file, which the bundler emits beside the app', async () => {
    canvasEncodes(encodesAsAsked);
    const compressPhoto = await freshCompressPhoto();

    await compressPhoto(photo(), 1000);

    const [worker] = FakeWorker.started;
    expect(worker.url.pathname).toMatch(/\/compressPhoto\.worker\.ts$/);
    expect(worker.options).toEqual({ type: 'module' });
  });

  it("returns the worker's bytes under the original name, typed as they were encoded", async () => {
    canvasEncodes(encodesAsAsked);
    answersWith({ blob: new Blob(['jpeg bytes'], { type: 'image/jpeg' }) });
    const compressPhoto = await freshCompressPhoto();

    const output = await compressPhoto(photo(), 1000);

    expect(output).toBeInstanceOf(File);
    expect(output.name).toBe('photo.jpg');
    expect(output.type).toBe('image/jpeg');
    expect(await output.text()).toBe('jpeg bytes');
  });

  // Safari and every iOS browser: a WebP request silently comes back as PNG.
  it('asks for JPEG where the canvas answers WebP with PNG', async () => {
    canvasEncodes(encodesLikeSafari);
    const compressPhoto = await freshCompressPhoto();

    await compressPhoto(photo(), 600);

    expect(FakeWorker.started[0].sent).toEqual([
      expect.objectContaining({ maxWidthOrHeight: 600, type: 'image/jpeg' }),
    ]);
  });

  it('asks for JPEG where the canvas produces nothing at all', async () => {
    canvasEncodes(() => null);
    const compressPhoto = await freshCompressPhoto();

    await compressPhoto(photo(), 600);

    expect(FakeWorker.started[0].sent).toEqual([
      expect.objectContaining({ type: 'image/jpeg' }),
    ]);
  });

  it('probes a 1x1 canvas for WebP once, however many photographs follow', async () => {
    const toBlob = canvasEncodes(encodesAsAsked);
    const compressPhoto = await freshCompressPhoto();

    await compressPhoto(photo(), 1000);
    await compressPhoto(photo(), 600);

    expect(toBlob).toHaveBeenCalledOnce();
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp');
    const canvas = toBlob.mock.contexts[0] as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([1, 1]);
    expect(FakeWorker.started).toHaveLength(2);
  });

  it('ends each worker once it has answered', async () => {
    canvasEncodes(encodesAsAsked);
    const compressPhoto = await freshCompressPhoto();

    await compressPhoto(photo(), 1000);
    await compressPhoto(photo(), 600);

    expect(FakeWorker.started.map((worker) => worker.terminated)).toEqual([
      true,
      true,
    ]);
  });

  it("rejects with the worker's reason when it could not compress, and ends it", async () => {
    canvasEncodes(encodesAsAsked);
    answersWith({
      error: 'EncodingError: The source image cannot be decoded.',
    });
    const compressPhoto = await freshCompressPhoto();

    await expect(compressPhoto(photo(), 1000)).rejects.toThrow(
      'EncodingError: The source image cannot be decoded.',
    );
    expect(FakeWorker.started[0].terminated).toBe(true);
  });

  // A worker file missing after a deploy, or refused by the CSP, never answers at all.
  it('rejects when the worker itself fails, and ends it', async () => {
    canvasEncodes(encodesAsAsked);
    FakeWorker.reply = (worker) => worker.fail();
    const compressPhoto = await freshCompressPhoto();

    const compressed = compressPhoto(photo(), 1000);

    await expect(compressed).rejects.toThrow(
      'The photo compression worker failed',
    );
    await expect(compressed).rejects.toHaveProperty('cause', expect.any(Event));
    expect(FakeWorker.started[0].terminated).toBe(true);
  });
});

describe('compressPhoto, where no worker can draw (no OffscreenCanvas)', () => {
  const close = vi.fn();
  const drawImage = vi.fn();

  beforeEach(() => {
    close.mockClear();
    drawImage.mockClear();
    vi.stubGlobal('OffscreenCanvas', undefined);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 3000, height: 2000, close })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      function (this: HTMLCanvasElement) {
        return {
          drawImage,
          fillRect: vi.fn(),
          canvas: this,
        } as unknown as CanvasRenderingContext2D;
      },
    );
  });

  it('draws and encodes on the main thread instead, starting no worker', async () => {
    const toBlob = canvasEncodes(encodesAsAsked);
    const compressPhoto = await freshCompressPhoto();

    const output = await compressPhoto(photo(), 1000);

    expect(FakeWorker.started).toEqual([]);
    expect(toBlob).toHaveBeenLastCalledWith(
      expect.any(Function),
      'image/webp',
      0.8,
    );
    const canvas = toBlob.mock.contexts[1] as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([1000, 667]);
    expect(drawImage).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(output.name).toBe('photo.jpg');
    expect(output.type).toBe('image/webp');
  });

  it('encodes JPEG there too where the canvas answers WebP with PNG', async () => {
    const toBlob = canvasEncodes(encodesLikeSafari);
    const compressPhoto = await freshCompressPhoto();

    const output = await compressPhoto(photo(), 600);

    expect(toBlob).toHaveBeenLastCalledWith(
      expect.any(Function),
      'image/jpeg',
      0.8,
    );
    expect(output.type).toBe('image/jpeg');
  });

  it('rejects when the canvas encodes nothing', async () => {
    // Only the 1x1 probe gets an answer.
    canvasEncodes((type, canvas) => (canvas.width === 1 ? 'image/webp' : null));
    const compressPhoto = await freshCompressPhoto();

    await expect(compressPhoto(photo(), 1000)).rejects.toThrow(
      'The canvas encoded nothing',
    );
    expect(close).toHaveBeenCalledOnce();
  });
});
