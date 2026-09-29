import { beforeEach, describe, expect, it, vi } from 'vitest';

import { compressOffscreen } from './compressOffscreen';
import type { CompressionRequest } from './drawPhoto';

const convertToBlob = vi.fn<(options: ImageEncodeOptions) => Promise<Blob>>();
const canvasSizes: number[][] = [];
const close = vi.fn();
let hasContext = true;

/** Just enough of an OffscreenCanvas for drawFitted to draw on and compressOffscreen to encode. */
class FakeOffscreenCanvas {
  constructor(width: number, height: number) {
    canvasSizes.push([width, height]);
  }
  getContext(contextId: string) {
    return hasContext && contextId === '2d'
      ? { drawImage: vi.fn(), fillRect: vi.fn(), canvas: this }
      : null;
  }
  convertToBlob(options: ImageEncodeOptions) {
    return convertToBlob(options);
  }
}

const request: CompressionRequest = {
  kind: 'compress',
  file: new Blob(['photo']),
  maxWidthOrHeight: 1000,
  type: 'image/webp',
  quality: 0.8,
};

beforeEach(() => {
  canvasSizes.length = 0;
  convertToBlob.mockReset();
  close.mockClear();
  hasContext = true;
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 3000, height: 2000, close })),
  );
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  return () => vi.unstubAllGlobals();
});

describe('compressOffscreen', () => {
  it('returns the photograph fitted and encoded as asked', async () => {
    const encoded = new Blob(['encoded'], { type: 'image/webp' });
    convertToBlob.mockResolvedValue(encoded);

    expect(await compressOffscreen(request)).toBe(encoded);
    expect(canvasSizes).toEqual([[1000, 667]]);
    expect(convertToBlob).toHaveBeenCalledWith({
      type: 'image/webp',
      quality: 0.8,
    });
  });

  it('decodes the file itself, so the browser applies its EXIF orientation, and releases the bitmap', async () => {
    convertToBlob.mockResolvedValue(new Blob([], { type: 'image/webp' }));

    await compressOffscreen(request);

    expect(createImageBitmap).toHaveBeenCalledWith(request.file);
    expect(close).toHaveBeenCalledOnce();
  });

  it('encodes JPEG at the quality asked when that is what the page asks for', async () => {
    convertToBlob.mockResolvedValue(new Blob([], { type: 'image/jpeg' }));

    await compressOffscreen({ ...request, type: 'image/jpeg', quality: 0.5 });

    expect(convertToBlob).toHaveBeenCalledWith({
      type: 'image/jpeg',
      quality: 0.5,
    });
  });

  it('rejects with the reason when the encoder refuses, and still releases the bitmap', async () => {
    convertToBlob.mockRejectedValue(
      new DOMException('The canvas is too large.', 'EncodingError'),
    );

    await expect(compressOffscreen(request)).rejects.toThrow(
      'The canvas is too large.',
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects when it has no 2D canvas to draw on, and still releases the bitmap', async () => {
    hasContext = false;

    await expect(compressOffscreen(request)).rejects.toThrow(
      'This browser has no 2D canvas to draw on',
    );
    expect(close).toHaveBeenCalledOnce();
    expect(convertToBlob).not.toHaveBeenCalled();
  });

  it('rejects when the photograph cannot be decoded, encoding nothing', async () => {
    vi.mocked(createImageBitmap).mockRejectedValue(
      new DOMException(
        'The source image could not be decoded.',
        'InvalidStateError',
      ),
    );

    await expect(compressOffscreen(request)).rejects.toThrow(
      'The source image could not be decoded.',
    );
    expect(convertToBlob).not.toHaveBeenCalled();
  });
});
