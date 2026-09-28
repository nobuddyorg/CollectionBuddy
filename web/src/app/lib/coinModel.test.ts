import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  create: vi.fn(),
  tensors: [] as unknown[][],
}));
vi.mock('onnxruntime-web/wasm', () => ({
  InferenceSession: { create: runtime.create },
  Tensor: class {
    constructor(...args: unknown[]) {
      runtime.tensors.push(args);
    }
  },
}));

import { loadModel, runModel } from './coinModel';

const MODEL_URL = 'https://example.test/models/isnet.onnx';

function fakeCache(entries: Record<string, Uint8Array<ArrayBuffer>> = {}) {
  const stored = new Map(Object.entries(entries));
  return {
    stored,
    match: vi.fn(async (url: string) =>
      stored.has(url) ? new Response(stored.get(url)) : undefined,
    ),
    keys: vi.fn(async () => [...stored.keys()].map((url) => new Request(url))),
    delete: vi.fn(async (request: Request) => stored.delete(request.url)),
    put: vi.fn(async (url: string, response: Response) => {
      stored.set(url, new Uint8Array(await response.arrayBuffer()));
    }),
  };
}

function streamed(chunks: number[][], headers: Record<string, string> = {}) {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(Uint8Array.from(chunk));
      controller.close();
    },
  });
  return new Response(body, { headers });
}

describe('loadModel', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads a cached model without touching the network', async () => {
    const cache = fakeCache({ [MODEL_URL]: Uint8Array.from([7, 8]) });
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const bytes = await loadModel(MODEL_URL, vi.fn());

    expect(Array.from(bytes)).toEqual([7, 8]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('downloads the model once, reporting progress, and keeps it in its own cache', async () => {
    const cache = fakeCache();
    const open = vi.fn(async () => cache);
    vi.stubGlobal('caches', { open });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamed([[1, 2], [3]], { 'content-length': '3' })),
    );
    const onProgress = vi.fn();

    const bytes = await loadModel(MODEL_URL, onProgress);

    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(onProgress.mock.calls).toEqual([
      [2, 3],
      [3, 3],
    ]);
    expect(open).toHaveBeenCalledWith('cb-coin-model');
    expect(Array.from(cache.stored.get(MODEL_URL)!)).toEqual([1, 2, 3]);
  });

  it('replaces an older model it cached under another name', async () => {
    const oldUrl = 'https://example.test/models/older.onnx';
    const cache = fakeCache({ [oldUrl]: Uint8Array.from([9]) });
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamed([[1]])),
    );

    await loadModel(MODEL_URL, vi.fn());

    expect([...cache.stored.keys()]).toEqual([MODEL_URL]);
  });

  it('reports an unknown total as 0 when the response names no length', async () => {
    vi.stubGlobal('caches', { open: vi.fn(async () => fakeCache()) });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamed([[1]])),
    );
    const onProgress = vi.fn();

    await loadModel(MODEL_URL, onProgress);

    expect(onProgress).toHaveBeenCalledWith(1, 0);
  });

  it('still downloads when the browser refuses Cache Storage, and says so', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('caches', {
      open: vi.fn(async () => {
        throw new DOMException('denied', 'SecurityError');
      }),
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => streamed([[5]])),
    );

    expect(Array.from(await loadModel(MODEL_URL, vi.fn()))).toEqual([5]);
    expect(warn).toHaveBeenCalledWith(
      'No Cache Storage for the coin model',
      expect.any(DOMException),
    );
    warn.mockRestore();
  });

  it('fails on a missing model rather than caching an error page', async () => {
    const cache = fakeCache();
    vi.stubGlobal('caches', { open: vi.fn(async () => cache) });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404 })),
    );

    await expect(loadModel(MODEL_URL, vi.fn())).rejects.toThrow('HTTP 404');
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('fails on a response with no body', async () => {
    vi.stubGlobal('caches', { open: vi.fn(async () => fakeCache()) });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null)),
    );

    await expect(loadModel(MODEL_URL, vi.fn())).rejects.toThrow('HTTP 200');
  });
});

describe('runModel', () => {
  const release = vi.fn(async () => {});
  const run = vi.fn<(feeds: Record<string, unknown>) => Promise<unknown>>();

  beforeEach(() => {
    runtime.tensors.length = 0;
    release.mockClear();
    run.mockReset();
    runtime.create.mockReset().mockResolvedValue({
      inputNames: ['input_image'],
      outputNames: ['output_image'],
      run,
      release,
    });
  });

  it("feeds the input as ISNet's 1x3x1024x1024 float tensor on the wasm backend", async () => {
    const prediction = new Float32Array([0.5]);
    run.mockResolvedValue({ output_image: { data: prediction } });
    const model = new Uint8Array([1]);
    const input = new Float32Array(3);

    const result = await runModel(model, input);

    expect(result).toBe(prediction);
    expect(runtime.create).toHaveBeenCalledWith(model, {
      executionProviders: ['wasm'],
    });
    expect(runtime.tensors).toEqual([['float32', input, [1, 3, 1024, 1024]]]);
    expect(Object.keys(run.mock.calls[0][0])).toEqual(['input_image']);
    expect(release).toHaveBeenCalledOnce();
  });

  it('releases the session even when the model fails', async () => {
    run.mockRejectedValue(new Error('out of memory'));

    await expect(
      runModel(new Uint8Array(), new Float32Array()),
    ).rejects.toThrow('out of memory');
    expect(release).toHaveBeenCalledOnce();
  });

  it('refuses a prediction that is not float32', async () => {
    run.mockResolvedValue({ output_image: { data: new Uint8Array([1]) } });

    await expect(
      runModel(new Uint8Array(), new Float32Array()),
    ).rejects.toThrow('no float32 prediction');
  });
});
