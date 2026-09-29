import { MODEL_SIZE } from './isnetTensor';

// Outside sw.js's `collectionbuddy-` prefix, whose per-build sweep would re-download 90 MB after every deploy.
const MODEL_CACHE = 'cb-segmentation-model';

export type DownloadProgress = (loaded: number, total: number) => void;

async function readAll(
  response: Response,
  onProgress: DownloadProgress,
): Promise<Uint8Array<ArrayBuffer>> {
  const total = Number(response.headers.get('content-length')) || 0;
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function download(
  url: string,
  onProgress: DownloadProgress,
): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(
      `The segmentation model did not download: HTTP ${response.status}`,
    );
  }
  return readAll(response, onProgress);
}

async function openCache(): Promise<Cache | undefined> {
  try {
    return await caches.open(MODEL_CACHE);
  } catch (error: unknown) {
    // Private windows can refuse it; the cut-out still works, it just downloads again.
    console.warn('No Cache Storage for the segmentation model', error);
    return undefined;
  }
}

/** The model's bytes: from this browser's cache, else downloaded once and kept there, replacing any older model. */
export async function loadModel(
  url: string,
  onProgress: DownloadProgress,
): Promise<Uint8Array<ArrayBuffer>> {
  const cache = await openCache();
  const cached = await cache?.match(url);
  if (cached) return new Uint8Array(await cached.arrayBuffer());
  const bytes = await download(url, onProgress);
  if (cache) {
    // `url` missed, so whatever is cached is an older model.
    const stale = await cache.keys();
    await Promise.all(stale.map((request) => cache.delete(request)));
    await cache.put(url, new Response(bytes));
  }
  return bytes;
}

/** ISNet's prediction for one normalized input; the runtime loads only here, inside the worker, on first use. */
export async function runModel(
  model: Uint8Array<ArrayBuffer>,
  input: Float32Array<ArrayBuffer>,
): Promise<Float32Array> {
  const { InferenceSession, Tensor } = await import('onnxruntime-web/wasm');
  const session = await InferenceSession.create(model, {
    executionProviders: ['wasm'],
  });
  try {
    const feeds = {
      [session.inputNames[0]]: new Tensor('float32', input, [
        1,
        3,
        MODEL_SIZE,
        MODEL_SIZE,
      ]),
    };
    const outputs = await session.run(feeds);
    const { data } = outputs[session.outputNames[0]];
    if (!(data instanceof Float32Array)) {
      throw new Error('The segmentation model returned no float32 prediction');
    }
    return data;
  } finally {
    await session.release();
  }
}
