import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CutoutReply, CutoutRequest } from './backgroundRemovalJob';
import type { CompressionRequest } from './drawPhoto';
import type { CompressionAnswer } from './photo.worker';

type Job = CompressionRequest | CutoutRequest;
type Answer = CompressionAnswer | CutoutReply;

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
});
