// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompressionAnswer } from './photo.worker';

type WorkerReply = (worker: FakeWorker) => void;

/** Stands in for the photo worker: records what it is sent and replies as the test says. */
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

    await compressPhoto(input, { maxWidthOrHeight: 1000 });

    expect(FakeWorker.started).toHaveLength(1);
    expect(FakeWorker.started[0].sent).toEqual([
      {
        kind: 'compress',
        file: input,
        maxWidthOrHeight: 1000,
        type: 'image/webp',
        quality: 0.8,
      },
    ]);
  });

  it('starts the one photo worker as a module, which the bundler emits beside the app', async () => {
    canvasEncodes(encodesAsAsked);
    const compressPhoto = await freshCompressPhoto();

    await compressPhoto(photo(), { maxWidthOrHeight: 1000 });

    const [worker] = FakeWorker.started;
    expect(worker.url.pathname).toMatch(/\/photo\.worker\.ts$/);
    expect(worker.options).toEqual({ type: 'module' });
  });

  it("returns the worker's bytes under the original name, typed as they were encoded", async () => {
    canvasEncodes(encodesAsAsked);
    answersWith({ blob: new Blob(['jpeg bytes'], { type: 'image/jpeg' }) });
    const compressPhoto = await freshCompressPhoto();

    const output = await compressPhoto(photo(), { maxWidthOrHeight: 1000 });

    expect(output).toBeInstanceOf(File);
    expect(output.name).toBe('photo.jpg');
    expect(output.type).toBe('image/jpeg');
    expect(await output.text()).toBe('jpeg bytes');
  });

  // Safari and every iOS browser: a WebP request silently comes back as PNG.
  it('asks for JPEG where the canvas answers WebP with PNG', async () => {
    canvasEncodes(encodesLikeSafari);
    const compressPhoto = await freshCompressPhoto();

    await compressPhoto(photo(), { maxWidthOrHeight: 600 });

    expect(FakeWorker.started[0].sent).toEqual([
      expect.objectContaining({ maxWidthOrHeight: 600, type: 'image/jpeg' }),
    ]);
  });

  it('asks for JPEG where the canvas produces nothing at all', async () => {
    canvasEncodes(() => null);
    const compressPhoto = await freshCompressPhoto();

    await compressPhoto(photo(), { maxWidthOrHeight: 600 });

    expect(FakeWorker.started[0].sent).toEqual([
      expect.objectContaining({ type: 'image/jpeg' }),
    ]);
  });

  it('asks for PNG, not JPEG, for a transparent cut-out where the canvas has no WebP', async () => {
    canvasEncodes(encodesLikeSafari);
    answersWith({ blob: new Blob(['encoded'], { type: 'image/png' }) });
    const compressPhoto = await freshCompressPhoto();

    const output = await compressPhoto(photo(), {
      maxWidthOrHeight: 600,
      encoding: 'transparent',
    });

    expect(FakeWorker.started[0].sent).toEqual([
      expect.objectContaining({ maxWidthOrHeight: 600, type: 'image/png' }),
    ]);
    expect(output.type).toBe('image/png');
  });

  it('probes a 1x1 canvas for WebP once, however many photographs follow', async () => {
    const toBlob = canvasEncodes(encodesAsAsked);
    const compressPhoto = await freshCompressPhoto();

    await compressPhoto(photo(), { maxWidthOrHeight: 1000 });
    await compressPhoto(photo(), { maxWidthOrHeight: 600 });

    expect(toBlob).toHaveBeenCalledOnce();
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp');
    const canvas = toBlob.mock.contexts[0] as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([1, 1]);
    expect(FakeWorker.started).toHaveLength(2);
  });

  it('ends each worker once it has answered', async () => {
    canvasEncodes(encodesAsAsked);
    const compressPhoto = await freshCompressPhoto();

    await compressPhoto(photo(), { maxWidthOrHeight: 1000 });
    await compressPhoto(photo(), { maxWidthOrHeight: 600 });

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

    await expect(
      compressPhoto(photo(), { maxWidthOrHeight: 1000 }),
    ).rejects.toThrow('EncodingError: The source image cannot be decoded.');
    expect(FakeWorker.started[0].terminated).toBe(true);
  });

  // A worker file missing after a deploy, or refused by the CSP, never answers at all.
  it('rejects when the worker itself fails, and ends it', async () => {
    canvasEncodes(encodesAsAsked);
    FakeWorker.reply = (worker) => worker.fail();
    const compressPhoto = await freshCompressPhoto();

    const compressed = compressPhoto(photo(), { maxWidthOrHeight: 1000 });

    await expect(compressed).rejects.toThrow(
      'The photo compression worker failed',
    );
    await expect(compressed).rejects.toHaveProperty('cause', expect.any(Event));
    expect(FakeWorker.started[0].terminated).toBe(true);
  });
});

describe('compressPhoto, where no worker can draw (no OffscreenCanvas)', () => {
  const drawImage = vi.fn();
  const decoded: HTMLImageElement[] = [];

  /** jsdom never decodes an `<img>`; this records each one decoded and settles it as `decode` says. */
  function imagesDecode(decode: (image: HTMLImageElement) => Promise<void>) {
    Object.defineProperty(HTMLImageElement.prototype, 'decode', {
      configurable: true,
      value: function (this: HTMLImageElement) {
        decoded.push(this);
        return decode(this);
      },
    });
  }
  const asPhotograph = async (image: HTMLImageElement) => {
    Object.defineProperties(image, {
      width: { value: 3000 },
      height: { value: 2000 },
    });
  };

  beforeEach(() => {
    decoded.length = 0;
    drawImage.mockClear();
    vi.stubGlobal('OffscreenCanvas', undefined);
    // Safari 14 has none, and Safari 15's ignores EXIF orientation, so the fallback must not need it.
    vi.stubGlobal('createImageBitmap', undefined);
    imagesDecode(asPhotograph);
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
  afterEach(() => {
    Reflect.deleteProperty(HTMLImageElement.prototype, 'decode');
  });

  it('decodes the photograph in an <img> from a data: URL, which applies its EXIF orientation', async () => {
    canvasEncodes(encodesAsAsked);
    const compressPhoto = await freshCompressPhoto();

    await compressPhoto(photo(), { maxWidthOrHeight: 1000 });

    expect(decoded).toHaveLength(1);
    expect(decoded[0].src).toBe('data:image/jpeg;base64,eA==');
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(
      decoded[0],
      0,
      0,
      1000,
      667,
    );
  });

  it('draws and encodes on the main thread instead, starting no worker', async () => {
    const toBlob = canvasEncodes(encodesAsAsked);
    const compressPhoto = await freshCompressPhoto();

    const output = await compressPhoto(photo(), { maxWidthOrHeight: 1000 });

    expect(FakeWorker.started).toEqual([]);
    expect(toBlob).toHaveBeenLastCalledWith(
      expect.any(Function),
      'image/webp',
      0.8,
    );
    const canvas = toBlob.mock.contexts[1] as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([1000, 667]);
    expect(output.name).toBe('photo.jpg');
    expect(output.type).toBe('image/webp');
  });

  it('encodes JPEG there too where the canvas answers WebP with PNG', async () => {
    const toBlob = canvasEncodes(encodesLikeSafari);
    const compressPhoto = await freshCompressPhoto();

    const output = await compressPhoto(photo(), { maxWidthOrHeight: 600 });

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

    await expect(
      compressPhoto(photo(), { maxWidthOrHeight: 1000 }),
    ).rejects.toThrow('The canvas encoded nothing');
  });

  it('rejects when the photograph cannot be decoded, drawing nothing', async () => {
    canvasEncodes(encodesAsAsked);
    imagesDecode(async () => {
      throw new DOMException(
        'The source image cannot be decoded.',
        'EncodingError',
      );
    });
    const compressPhoto = await freshCompressPhoto();

    await expect(
      compressPhoto(photo(), { maxWidthOrHeight: 1000 }),
    ).rejects.toThrow('The source image cannot be decoded.');
    expect(drawImage).not.toHaveBeenCalled();
  });

  it('rejects when the file cannot be read, decoding nothing', async () => {
    canvasEncodes(encodesAsAsked);
    vi.spyOn(FileReader.prototype, 'readAsDataURL').mockImplementation(
      function (this: FileReader) {
        this.dispatchEvent(new ProgressEvent('error'));
      },
    );
    const compressPhoto = await freshCompressPhoto();

    await expect(
      compressPhoto(photo(), { maxWidthOrHeight: 1000 }),
    ).rejects.toThrow('The photograph could not be read');
    expect(decoded).toEqual([]);
  });
});
