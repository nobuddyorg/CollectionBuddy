// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CutoutReply, CutoutRequest } from './coinCutoutJob';
import {
  coinModelUrl,
  cutOutCoin,
  NoCoinFoundError,
  preloadCoinModel,
} from './coinCutout';

/** Stands in for the module worker: records what the page asks and answers with whatever the test replies. */
class FakeWorker {
  static created: FakeWorker[] = [];
  onmessage: ((event: MessageEvent<CutoutReply>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  requests: CutoutRequest[] = [];
  terminate = vi.fn();

  constructor(
    readonly url: URL,
    readonly options: WorkerOptions,
  ) {
    FakeWorker.created.push(this);
  }

  postMessage(request: CutoutRequest) {
    this.requests.push(request);
  }

  reply(data: CutoutReply) {
    this.onmessage!(new MessageEvent('message', { data }));
  }
}

const lastWorker = () => FakeWorker.created.at(-1)!;
const photo = new Blob(['jpeg'], { type: 'image/jpeg' });
const cutout = {
  blob: new Blob(['png'], { type: 'image/png' }),
  width: 10,
  height: 10,
  mode: 'ellipse' as const,
  fillRatio: 0.97,
};

beforeEach(() => {
  FakeWorker.created = [];
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('coinModelUrl', () => {
  it("serves the model from the site's own models folder, under its base path", () => {
    vi.stubEnv('NEXT_PUBLIC_COIN_MODEL_PATH', '');
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', '/CollectionBuddy');

    expect(coinModelUrl()).toBe(
      `${location.origin}/CollectionBuddy/models/isnet-general-use-fp16.onnx`,
    );
  });

  it('serves it from the site root without a base path', () => {
    vi.stubEnv('NEXT_PUBLIC_COIN_MODEL_PATH', '');
    vi.stubEnv('NEXT_PUBLIC_BASE_PATH', undefined);

    expect(coinModelUrl()).toBe(
      `${location.origin}/models/isnet-general-use-fp16.onnx`,
    );
  });

  it('serves it from NEXT_PUBLIC_COIN_MODEL_PATH when that is set', () => {
    vi.stubEnv(
      'NEXT_PUBLIC_COIN_MODEL_PATH',
      'https://assets.example.test/cb/',
    );

    expect(coinModelUrl()).toBe(
      'https://assets.example.test/cb/isnet-general-use-fp16.onnx',
    );
  });
});

describe('cutOutCoin', () => {
  it('asks a module worker to cut out the photo, with the defaults', async () => {
    vi.stubEnv('NEXT_PUBLIC_COIN_MODEL_PATH', 'https://assets.example.test/');
    const pending = cutOutCoin(photo);
    const worker = lastWorker();
    worker.reply({ kind: 'cut-out', cutout });

    await expect(pending).resolves.toBe(cutout);
    expect(worker.options).toEqual({ type: 'module' });
    expect(worker.url.pathname).toMatch(/coinCutout\.worker\.ts$/);
    expect(worker.requests).toEqual([
      {
        kind: 'cut-out',
        file: photo,
        modelUrl: 'https://assets.example.test/isnet-general-use-fp16.onnx',
        maxSide: 2048,
        minFillRatio: 0.9,
      },
    ]);
  });

  it('passes a caller-chosen size cap and fill ratio through', async () => {
    const pending = cutOutCoin(photo, { maxSide: 1000, minFillRatio: 0.8 });
    lastWorker().reply({ kind: 'cut-out', cutout });
    await pending;

    expect(lastWorker().requests[0]).toMatchObject({
      maxSide: 1000,
      minFillRatio: 0.8,
    });
  });

  it('forwards progress and ends the worker once the answer is in', async () => {
    const onProgress = vi.fn();
    const pending = cutOutCoin(photo, { onProgress });
    const worker = lastWorker();
    worker.reply({ kind: 'progress', progress: { stage: 'analyze' } });

    expect(onProgress).toHaveBeenCalledWith({ stage: 'analyze' });
    expect(worker.terminate).not.toHaveBeenCalled();

    worker.reply({ kind: 'cut-out', cutout });
    await pending;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('ignores progress when nobody listens for it', async () => {
    const pending = cutOutCoin(photo);
    lastWorker().reply({ kind: 'progress', progress: { stage: 'analyze' } });
    lastWorker().reply({ kind: 'cut-out', cutout });

    await expect(pending).resolves.toBe(cutout);
  });

  it('rejects with NoCoinFoundError when the photo shows no coin', async () => {
    const pending = cutOutCoin(photo);
    lastWorker().reply({ kind: 'no-coin' });

    await expect(pending).rejects.toBeInstanceOf(NoCoinFoundError);
    await expect(pending).rejects.toHaveProperty('name', 'NoCoinFoundError');
    await expect(pending).rejects.toThrow('no coin');
  });

  it("rejects with the worker's reason when it fails", async () => {
    const pending = cutOutCoin(photo);
    lastWorker().reply({ kind: 'failed', message: 'Error: HTTP 404' });

    await expect(pending).rejects.toThrow('Error: HTTP 404');
  });

  it('rejects on a reply meant for a preload', async () => {
    const pending = cutOutCoin(photo);
    lastWorker().reply({ kind: 'preloaded' });

    await expect(pending).rejects.toThrow('Unexpected reply');
  });

  it('rejects, and ends the worker, when the worker itself errors', async () => {
    const pending = cutOutCoin(photo);
    const worker = lastWorker();
    worker.onerror!(new ErrorEvent('error', { message: 'script failed' }));

    await expect(pending).rejects.toThrow('script failed');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('stops the worker at once when the caller aborts', async () => {
    const controller = new AbortController();
    const pending = cutOutCoin(photo, { signal: controller.signal });
    const worker = lastWorker();

    controller.abort(new Error('closed'));

    await expect(pending).rejects.toThrow('closed');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('rejects with an Error even when the abort reason is not one', async () => {
    const controller = new AbortController();
    const pending = cutOutCoin(photo, { signal: controller.signal });

    controller.abort('dialog closed');

    await expect(pending).rejects.toThrow(new Error('dialog closed'));
  });

  it('starts no worker for an already aborted request', async () => {
    const controller = new AbortController();
    controller.abort(new Error('closed'));

    await expect(
      cutOutCoin(photo, { signal: controller.signal }),
    ).rejects.toThrow('closed');
    expect(FakeWorker.created).toHaveLength(0);
  });

  it('stops listening for an abort once the answer is in', async () => {
    const controller = new AbortController();
    const pending = cutOutCoin(photo, { signal: controller.signal });
    const worker = lastWorker();
    worker.reply({ kind: 'cut-out', cutout });
    await pending;

    controller.abort();

    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});

describe('preloadCoinModel', () => {
  it('asks the worker only to download the model', async () => {
    vi.stubEnv('NEXT_PUBLIC_COIN_MODEL_PATH', 'https://assets.example.test/');
    const onProgress = vi.fn();
    const pending = preloadCoinModel({ onProgress });
    const worker = lastWorker();
    worker.reply({
      kind: 'progress',
      progress: { stage: 'download', loaded: 1, total: 2 },
    });
    worker.reply({ kind: 'preloaded' });

    await expect(pending).resolves.toBeUndefined();
    expect(worker.requests).toEqual([
      {
        kind: 'preload',
        modelUrl: 'https://assets.example.test/isnet-general-use-fp16.onnx',
      },
    ]);
    expect(onProgress).toHaveBeenCalledWith({
      stage: 'download',
      loaded: 1,
      total: 2,
    });
  });

  it('works without options', async () => {
    const pending = preloadCoinModel();
    lastWorker().reply({ kind: 'preloaded' });

    await expect(pending).resolves.toBeUndefined();
  });

  it('rejects when the download fails', async () => {
    const pending = preloadCoinModel();
    lastWorker().reply({ kind: 'failed', message: 'Error: HTTP 404' });

    await expect(pending).rejects.toThrow('HTTP 404');
  });
});
