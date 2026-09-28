import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const model = vi.hoisted(() => ({
  loadModel: vi.fn(),
  runModel: vi.fn(),
}));
vi.mock('./coinModel', () => model);

import { handleRequest, type CutoutReply } from './coinCutoutJob';
import { MODEL_SIZE } from './isnetTensor';

const PHOTO = { width: 40, height: 20 };

/** A prediction with a disc of `radius` model pixels in the middle, or nothing at all for 0. */
function discPrediction(radius: number): Float32Array {
  const prediction = new Float32Array(MODEL_SIZE * MODEL_SIZE);
  const centre = MODEL_SIZE / 2;
  for (let y = 0; y < MODEL_SIZE; y += 1) {
    for (let x = 0; x < MODEL_SIZE; x += 1) {
      if (Math.hypot(x - centre, y - centre) < radius) {
        prediction[y * MODEL_SIZE + x] = 1;
      }
    }
  }
  return prediction;
}

// Worker-only canvas APIs, faked just far enough to carry pixels through the job.
const drawn: { width: number; height: number; smoothing: string }[] = [];
const encoded: { data: Uint8ClampedArray; width: number; height: number }[] =
  [];
const bitmap = { ...PHOTO, close: vi.fn() };

class FakeOffscreenCanvas {
  constructor(
    readonly width: number,
    readonly height: number,
  ) {}

  getContext(type: string) {
    if (type !== '2d') throw new Error(`no ${type} context`);
    const context = {
      imageSmoothingQuality: 'low',
      drawImage: (
        _source: unknown,
        _x: number,
        _y: number,
        width: number,
        height: number,
      ) =>
        drawn.push({ width, height, smoothing: context.imageSmoothingQuality }),
      getImageData: (
        _x: number,
        _y: number,
        width: number,
        height: number,
      ) => ({
        data: new Uint8ClampedArray(width * height * 4).fill(200),
      }),
      putImageData: (image: {
        data: Uint8ClampedArray;
        width: number;
        height: number;
      }) => encoded.push(image),
    };
    return context;
  }

  async convertToBlob(options: { type: string }) {
    return new Blob(['png'], options);
  }
}

class FakeImageData {
  constructor(
    readonly data: Uint8ClampedArray,
    readonly width: number,
    readonly height: number,
  ) {}
}

async function repliesTo(request: Parameters<typeof handleRequest>[0]) {
  const replies: CutoutReply[] = [];
  await handleRequest(request, (reply) => replies.push(reply));
  return replies;
}

const cutOutRequest = {
  kind: 'cut-out' as const,
  file: new Blob(['jpeg'], { type: 'image/jpeg' }),
  modelUrl: 'https://example.test/models/isnet.onnx',
  maxSide: 2048,
  minFillRatio: 0.9,
};

describe('handleRequest', () => {
  beforeEach(() => {
    drawn.length = 0;
    encoded.length = 0;
    bitmap.close.mockClear();
    vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
    vi.stubGlobal('ImageData', FakeImageData);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => bitmap),
    );
    model.loadModel
      .mockReset()
      .mockImplementation(
        async (
          _url: string,
          onProgress: (loaded: number, total: number) => void,
        ) => {
          onProgress(50, 100);
          return new Uint8Array([1]);
        },
      );
    model.runModel.mockReset().mockResolvedValue(discPrediction(200));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preloads by downloading the model only, reporting progress', async () => {
    const replies = await repliesTo({
      kind: 'preload',
      modelUrl: cutOutRequest.modelUrl,
    });

    expect(replies).toEqual([
      {
        kind: 'progress',
        progress: { stage: 'download', loaded: 50, total: 100 },
      },
      { kind: 'preloaded' },
    ]);
    expect(model.loadModel).toHaveBeenCalledWith(
      cutOutRequest.modelUrl,
      expect.any(Function),
    );
    expect(model.runModel).not.toHaveBeenCalled();
  });

  it('cuts the coin out as a transparent PNG cropped to it', async () => {
    const replies = await repliesTo(cutOutRequest);

    expect(replies.slice(0, 2)).toEqual([
      {
        kind: 'progress',
        progress: { stage: 'download', loaded: 50, total: 100 },
      },
      { kind: 'progress', progress: { stage: 'analyze' } },
    ]);
    const last = replies[2];
    expect(last.kind).toBe('cut-out');
    if (last.kind !== 'cut-out') return;
    expect(last.cutout.blob.type).toBe('image/png');
    expect(last.cutout.mode).toBe('ellipse');
    expect(last.cutout.fillRatio).toBeGreaterThan(0.9);
    // A disc of radius 200 in 1024 spans 16 of the photo's 40 columns and 8 of its 20 rows.
    expect(last.cutout.width).toBeGreaterThanOrEqual(15);
    expect(last.cutout.width).toBeLessThanOrEqual(18);
    expect(last.cutout.height).toBeGreaterThanOrEqual(7);
    expect(last.cutout.height).toBeLessThanOrEqual(10);
    expect(encoded[0].width).toBe(last.cutout.width);
    expect(encoded[0].data.length).toBe(
      last.cutout.width * last.cutout.height * 4,
    );
  });

  it('decodes upright, at the photo size capped by maxSide, and once more at the model size', async () => {
    const createImageBitmap = vi.fn(async () => ({
      width: 4000,
      height: 3000,
      close: bitmap.close,
    }));
    vi.stubGlobal('createImageBitmap', createImageBitmap);

    await repliesTo({ ...cutOutRequest, maxSide: 20 });

    expect(createImageBitmap).toHaveBeenCalledWith(cutOutRequest.file, {
      imageOrientation: 'from-image',
    });
    expect(drawn).toEqual([
      { width: 20, height: 15, smoothing: 'high' },
      { width: MODEL_SIZE, height: MODEL_SIZE, smoothing: 'high' },
    ]);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it('feeds the model the photo stretched to its square input', async () => {
    await repliesTo(cutOutRequest);

    const [, input] = model.runModel.mock.calls[0] as [
      Uint8Array,
      Float32Array,
    ];
    expect(input).toHaveLength(3 * MODEL_SIZE * MODEL_SIZE);
  });

  it('falls back to the model mask when the object is not a clean ellipse', async () => {
    const square = new Float32Array(MODEL_SIZE * MODEL_SIZE);
    for (let y = 200; y < 800; y += 1)
      square.fill(1, y * MODEL_SIZE + 200, y * MODEL_SIZE + 800);
    model.runModel.mockResolvedValue(square);

    const replies = await repliesTo(cutOutRequest);

    const last = replies.at(-1)!;
    expect(last.kind === 'cut-out' && last.cutout.mode).toBe('mask');
  });

  it('respects a stricter minimum fill ratio', async () => {
    const replies = await repliesTo({ ...cutOutRequest, minFillRatio: 1.01 });

    const last = replies.at(-1)!;
    expect(last.kind === 'cut-out' && last.cutout.mode).toBe('mask');
  });

  it('answers no-coin when the model finds nothing', async () => {
    model.runModel.mockResolvedValue(new Float32Array(MODEL_SIZE * MODEL_SIZE));

    const replies = await repliesTo(cutOutRequest);

    expect(replies.at(-1)).toEqual({ kind: 'no-coin' });
  });

  it('answers failed, with the reason, when a step throws', async () => {
    model.loadModel.mockRejectedValue(new Error('HTTP 404'));

    const replies = await repliesTo(cutOutRequest);

    expect(replies).toEqual([{ kind: 'failed', message: 'Error: HTTP 404' }]);
  });

  it('closes the decoded photo even when drawing it fails', async () => {
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          throw new Error('no canvas');
        }
      },
    );

    const replies = await repliesTo(cutOutRequest);

    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(replies).toEqual([{ kind: 'failed', message: 'Error: no canvas' }]);
  });

  it('answers failed for a file the browser cannot decode', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new DOMException(
          'The source image could not be decoded.',
          'InvalidStateError',
        );
      }),
    );

    const replies = await repliesTo(cutOutRequest);

    expect(replies).toEqual([
      {
        kind: 'failed',
        message: 'InvalidStateError: The source image could not be decoded.',
      },
    ]);
    expect(model.loadModel).not.toHaveBeenCalled();
  });
});
