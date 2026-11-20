import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CutoutReply, CutoutRequest } from './backgroundRemovalJob';
import type { CompressionRequest } from './drawPhoto';
import type {
  FrameCrop,
  FrameCropAnswer,
  FrameCropRequest,
} from './frameCropJob';
import type { CompressionAnswer } from './photo.worker';
import type {
  InspectionAnswer,
  InspectionRequest,
  PhotoInspection,
  Rotated,
  RotationAnswer,
  RotationRequest,
} from './rotationJob';
import type { SharpnessAnswer, SharpnessRequest } from './sharpnessJob';

type Job =
  | CompressionRequest
  | SharpnessRequest
  | CutoutRequest
  | RotationRequest
  | InspectionRequest
  | FrameCropRequest;
type Answer =
  | CompressionAnswer
  | SharpnessAnswer
  | CutoutReply
  | RotationAnswer
  | InspectionAnswer
  | FrameCropAnswer;

const handleRequest = vi.hoisted(() =>
  vi.fn<
    (
      request: CutoutRequest,
      reply: (reply: CutoutReply) => void,
    ) => Promise<void>
  >(),
);
const compressOffscreen = vi.hoisted(() =>
  vi.fn<(request: CompressionRequest) => Promise<Blob>>(),
);
vi.mock('./backgroundRemovalJob', () => ({ handleRequest }));
vi.mock('./compressOffscreen', () => ({ compressOffscreen }));
const measureOffscreen = vi.hoisted(() =>
  vi.fn<(request: SharpnessRequest) => Promise<number>>(),
);
vi.mock('./sharpnessJob', () => ({ measureOffscreen }));
const rotation = vi.hoisted(() => ({
  rotateOffscreen: vi.fn<(request: RotationRequest) => Promise<Rotated>>(),
  inspectOffscreen:
    vi.fn<(request: InspectionRequest) => Promise<PhotoInspection>>(),
}));
vi.mock('./rotationJob', () => rotation);
const cropFrameOffscreen = vi.hoisted(() =>
  vi.fn<(request: FrameCropRequest) => Promise<FrameCrop>>(),
);
vi.mock('./frameCropJob', () => ({ cropFrameOffscreen }));

/** The worker's global scope: the page's messages arrive at `onmessage`, and its answers are recorded. */
const scope = {
  onmessage: null as ((event: { data: Job }) => void) | null,
  answers: [] as Answer[],
  postMessage(answer: Answer) {
    scope.answers.push(answer);
  },
};

const compression: CompressionRequest = {
  kind: 'compress',
  file: new Blob(['photo']),
  maxWidthOrHeight: 1000,
  type: 'image/webp',
  quality: 0.8,
};
const cutout: CutoutRequest = {
  kind: 'cut-out',
  file: new Blob(['photo']),
  modelUrl: 'https://example.test/m.onnx',
  maxSide: 2048,
  minFillRatio: 0.95,
  margin: 0.08,
};

/** Delivers a job the way the page's postMessage would, and waits for the answers expected of it. */
async function send(job: Job, expected: Answer[]) {
  scope.onmessage!({ data: job });
  await vi.waitFor(() => expect(scope.answers).toEqual(expected));
}

beforeEach(async () => {
  scope.onmessage = null;
  scope.answers = [];
  handleRequest.mockReset();
  compressOffscreen.mockReset();
  measureOffscreen.mockReset();
  rotation.rotateOffscreen.mockReset();
  rotation.inspectOffscreen.mockReset();
  vi.stubGlobal('self', scope);
  vi.resetModules();
  await import('./photo.worker');
  return () => vi.unstubAllGlobals();
});

describe('the photo worker', () => {
  it('answers a compression with the photograph it encoded, through postMessage', async () => {
    const encoded = new Blob(['encoded'], { type: 'image/webp' });
    compressOffscreen.mockResolvedValue(encoded);

    await send(compression, [{ blob: encoded }]);

    expect(compressOffscreen).toHaveBeenCalledExactlyOnceWith(compression);
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it('answers a compression that failed with its reason', async () => {
    compressOffscreen.mockRejectedValue(
      new DOMException('The canvas is too large.', 'EncodingError'),
    );

    await send(compression, [
      { error: 'EncodingError: The canvas is too large.' },
    ]);
  });

  it('answers a sharpness check with its score', async () => {
    const check: SharpnessRequest = {
      kind: 'sharpness',
      file: new Blob(['photo']),
    };
    measureOffscreen.mockResolvedValue(1234.5);

    await send(check, [{ score: 1234.5 }]);

    expect(measureOffscreen).toHaveBeenCalledExactlyOnceWith(check);
    expect(compressOffscreen).not.toHaveBeenCalled();
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it('answers a sharpness check that failed with its reason', async () => {
    measureOffscreen.mockRejectedValue(
      new DOMException('The source image cannot be decoded.', 'EncodingError'),
    );

    await send({ kind: 'sharpness', file: new Blob(['photo']) }, [
      { error: 'EncodingError: The source image cannot be decoded.' },
    ]);
  });

  it('hands a cut-out to the background removal job and posts each of its replies', async () => {
    handleRequest.mockImplementation(async (_request, reply) => {
      reply({ kind: 'progress', progress: { stage: 'analyze' } });
      reply({ kind: 'no-object' });
    });

    await send(cutout, [
      { kind: 'progress', progress: { stage: 'analyze' } },
      { kind: 'no-object' },
    ]);

    expect(handleRequest).toHaveBeenCalledWith(cutout, expect.any(Function));
    expect(compressOffscreen).not.toHaveBeenCalled();
  });

  it('hands a model preload to the background removal job too', async () => {
    const preload: CutoutRequest = {
      kind: 'preload',
      modelUrl: cutout.modelUrl,
    };
    handleRequest.mockImplementation(async (_request, reply) => {
      reply({ kind: 'preloaded' });
    });

    await send(preload, [{ kind: 'preloaded' }]);

    expect(handleRequest).toHaveBeenCalledWith(preload, expect.any(Function));
  });

  it('answers a rotation with the turned photo and whether it is a cut-out', async () => {
    const turn: RotationRequest = {
      kind: 'rotate',
      file: new Blob(['photo']),
      degrees: 90,
    };
    const rotated = { blob: new Blob(['png']), transparent: true };
    rotation.rotateOffscreen.mockResolvedValue(rotated);

    await send(turn, [rotated]);

    expect(rotation.rotateOffscreen).toHaveBeenCalledExactlyOnceWith(turn);
    expect(compressOffscreen).not.toHaveBeenCalled();
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it('answers a rotation that failed with its reason', async () => {
    rotation.rotateOffscreen.mockRejectedValue(new Error('No canvas'));

    await send({ kind: 'rotate', file: new Blob(['photo']), degrees: 3 }, [
      { error: 'Error: No canvas' },
    ]);
  });

  it('answers a hand-drawn crop with the cropped photo and whether it is a cut-out', async () => {
    const cut: FrameCropRequest = {
      kind: 'crop-frame',
      file: new Blob(['photo']),
      box: { x: 1, y: 2, width: 30, height: 40 },
    };
    const cropped = { blob: new Blob(['png']), transparent: false };
    cropFrameOffscreen.mockResolvedValue(cropped);

    await send(cut, [cropped]);

    expect(cropFrameOffscreen).toHaveBeenCalledExactlyOnceWith(cut);
    expect(rotation.rotateOffscreen).not.toHaveBeenCalled();
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it('answers a hand-drawn crop that failed with its reason', async () => {
    cropFrameOffscreen.mockRejectedValue(new Error('No canvas'));

    await send(
      {
        kind: 'crop-frame',
        file: new Blob(['photo']),
        box: { x: 0, y: 0, width: 1, height: 1 },
      },
      [{ error: 'Error: No canvas' }],
    );
  });

  it('answers an inspection with what it found', async () => {
    const look: InspectionRequest = {
      kind: 'inspect-rotation',
      file: new Blob(['photo']),
    };
    const inspection: PhotoInspection = {
      transparent: true,
      straightening: { kind: 'straighten', degrees: -3.5 },
    };
    rotation.inspectOffscreen.mockResolvedValue(inspection);

    await send(look, [{ inspection }]);

    expect(rotation.inspectOffscreen).toHaveBeenCalledExactlyOnceWith(look);
    expect(handleRequest).not.toHaveBeenCalled();
  });

  it('answers an inspection that failed with its reason', async () => {
    rotation.inspectOffscreen.mockRejectedValue(new Error('Undecodable'));

    await send({ kind: 'inspect-rotation', file: new Blob(['photo']) }, [
      { error: 'Error: Undecodable' },
    ]);
  });
});
