import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CompressionAnswer } from './compressPhoto.worker';
import type { CompressionRequest } from './drawPhoto';

const answers: CompressionAnswer[] = [];
const listeners = new Map<string, (event: { data: unknown }) => void>();
const convertToBlob = vi.fn<(options: ImageEncodeOptions) => Promise<Blob>>();
const canvasSizes: number[][] = [];
const close = vi.fn();
let hasContext = true;

/** Just enough of an OffscreenCanvas for drawFitted to draw on and this worker to encode. */
class FakeOffscreenCanvas {
  constructor(width: number, height: number) {
    canvasSizes.push([width, height]);
  }
  getContext() {
    return hasContext
      ? { drawImage: vi.fn(), fillRect: vi.fn(), canvas: this }
      : null;
  }
  convertToBlob(options: ImageEncodeOptions) {
    return convertToBlob(options);
  }
}

const request: CompressionRequest = {
  file: new Blob(['photo']),
  maxWidthOrHeight: 1000,
  type: 'image/webp',
  quality: 0.8,
};

/** Delivers a request the way the page's postMessage would, and waits for the one answer. */
async function send(data: CompressionRequest): Promise<CompressionAnswer[]> {
  listeners.get('message')?.({ data });
  await vi.waitFor(() => expect(answers).toHaveLength(1));
  return answers;
}

beforeEach(async () => {
  answers.length = 0;
  canvasSizes.length = 0;
  listeners.clear();
  convertToBlob.mockReset();
  close.mockClear();
  hasContext = true;
  vi.stubGlobal('self', {
    addEventListener: (type: string, listener: () => void) =>
      listeners.set(type, listener),
    postMessage: (message: CompressionAnswer) => answers.push(message),
  });
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 3000, height: 2000, close })),
  );
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
  vi.resetModules();
  await import('./compressPhoto.worker');
  return () => vi.unstubAllGlobals();
});

describe('the photo compression worker', () => {
  it('answers with the photograph fitted and encoded as asked', async () => {
    const encoded = new Blob(['encoded'], { type: 'image/webp' });
    convertToBlob.mockResolvedValue(encoded);

    expect(await send(request)).toEqual([{ blob: encoded }]);
    expect(canvasSizes).toEqual([[1000, 667]]);
    expect(convertToBlob).toHaveBeenCalledWith({
      type: 'image/webp',
      quality: 0.8,
    });
  });

  it('decodes the file itself, so the browser applies its EXIF orientation, and releases the bitmap', async () => {
    convertToBlob.mockResolvedValue(new Blob([], { type: 'image/webp' }));

    await send(request);

    expect(createImageBitmap).toHaveBeenCalledWith(request.file);
    expect(close).toHaveBeenCalledOnce();
  });

  it('encodes JPEG at the quality asked when that is what the page asks for', async () => {
    convertToBlob.mockResolvedValue(new Blob([], { type: 'image/jpeg' }));

    await send({ ...request, type: 'image/jpeg', quality: 0.5 });

    expect(convertToBlob).toHaveBeenCalledWith({
      type: 'image/jpeg',
      quality: 0.5,
    });
  });

  it('answers with the reason when the encoder refuses', async () => {
    convertToBlob.mockRejectedValue(
      new DOMException('The canvas is too large.', 'EncodingError'),
    );

    expect(await send(request)).toEqual([
      { error: 'EncodingError: The canvas is too large.' },
    ]);
    expect(close).toHaveBeenCalledOnce();
  });

  it('answers with the reason when it has no 2D canvas to draw on, and still releases the bitmap', async () => {
    hasContext = false;

    expect(await send(request)).toEqual([
      { error: 'Error: This browser has no 2D canvas to draw on' },
    ]);
    expect(close).toHaveBeenCalledOnce();
    expect(convertToBlob).not.toHaveBeenCalled();
  });

  it('answers with the reason when the photograph cannot be decoded', async () => {
    vi.mocked(createImageBitmap).mockRejectedValue(
      new DOMException(
        'The source image could not be decoded.',
        'InvalidStateError',
      ),
    );

    expect(await send(request)).toEqual([
      { error: 'InvalidStateError: The source image could not be decoded.' },
    ]);
    expect(convertToBlob).not.toHaveBeenCalled();
  });
});
