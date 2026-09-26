// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const imageCompression = vi.fn(
  async (file: File, options: { fileType: string }) =>
    new File([file], file.name, { type: options.fileType }),
);
vi.mock('browser-image-compression', () => ({ default: imageCompression }));

/** jsdom's canvas cannot encode; this one answers a WebP request the way the browser under test would. */
function canvasEncodes(answer: string | null) {
  return vi
    .spyOn(HTMLCanvasElement.prototype, 'toBlob')
    .mockImplementation(function (this: HTMLCanvasElement, callback) {
      callback(answer === null ? null : new Blob([], { type: answer }));
    });
}

// The probe is cached per module, so each test loads a fresh copy.
async function freshCompressPhoto() {
  vi.resetModules();
  return (await import('./imageCompression')).compressPhoto;
}

const photo = () => new File(['x'], 'photo.jpg', { type: 'image/jpeg' });

describe('compressPhoto', () => {
  // Braces: a function returned from beforeEach runs as its cleanup, and mockClear() returns the mock.
  beforeEach(() => {
    imageCompression.mockClear();
  });
  afterEach(() => vi.restoreAllMocks());

  it('encodes WebP at 80% quality in a worker where the browser can', async () => {
    canvasEncodes('image/webp');
    const compressPhoto = await freshCompressPhoto();
    const input = photo();

    const output = await compressPhoto(input, 1000);

    expect(imageCompression).toHaveBeenCalledWith(input, {
      maxWidthOrHeight: 1000,
      initialQuality: 0.8,
      fileType: 'image/webp',
      useWebWorker: true,
    });
    expect(output.type).toBe('image/webp');
  });

  // Safari and every iOS browser: a WebP request silently comes back as PNG.
  it('encodes JPEG where the canvas answers WebP with PNG', async () => {
    canvasEncodes('image/png');
    const compressPhoto = await freshCompressPhoto();

    const output = await compressPhoto(photo(), 600);

    expect(imageCompression).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({
        maxWidthOrHeight: 600,
        fileType: 'image/jpeg',
      }),
    );
    expect(output.type).toBe('image/jpeg');
  });

  it('encodes JPEG where the canvas produces nothing at all', async () => {
    canvasEncodes(null);
    const compressPhoto = await freshCompressPhoto();

    await compressPhoto(photo(), 600);

    expect(imageCompression).toHaveBeenCalledWith(
      expect.any(File),
      expect.objectContaining({ fileType: 'image/jpeg' }),
    );
  });

  it('probes a 1x1 canvas for WebP once, however many photographs follow', async () => {
    const toBlob = canvasEncodes('image/webp');
    const compressPhoto = await freshCompressPhoto();

    await compressPhoto(photo(), 1000);
    await compressPhoto(photo(), 600);

    expect(toBlob).toHaveBeenCalledOnce();
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp');
    const canvas = toBlob.mock.contexts[0] as HTMLCanvasElement;
    expect([canvas.width, canvas.height]).toEqual([1, 1]);
    expect(imageCompression).toHaveBeenCalledTimes(2);
  });
});
