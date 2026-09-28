import type {
  CoinCutout,
  CutoutProgress,
  CutoutReply,
  CutoutRequest,
} from './coinCutoutJob';

export type { CoinCutout, CutoutProgress };

// Renamed with the model: a new file name is what retires the copy browsers cached (coinModel.ts).
const MODEL_FILE = 'isnet-general-use-fp16.onnx';

export class NoCoinFoundError extends Error {
  constructor() {
    super('The photo shows no coin to cut out');
    this.name = 'NoCoinFoundError';
  }
}

export type CutOutOptions = {
  onProgress?: (progress: CutoutProgress) => void;
  signal?: AbortSignal;
  /** The longer side the photo is analysed and cut out at; a 4000px phone photo is scaled down to it. */
  maxSide?: number;
  /** Below this fill ratio the ellipse is not trusted and the cleaned model mask is used instead. */
  minFillRatio?: number;
};

/** Where the model is served from: NEXT_PUBLIC_COIN_MODEL_PATH, else this site's own `models/` folder. */
export function coinModelUrl(): string {
  const folder =
    process.env.NEXT_PUBLIC_COIN_MODEL_PATH ||
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/models/`;
  return new URL(MODEL_FILE, new URL(folder, document.baseURI)).href;
}

// One worker per job, ended with it, so the ~200 MB the runtime holds is freed as soon as the answer is in.
function runInWorker(
  request: CutoutRequest,
  { onProgress, signal }: Pick<CutOutOptions, 'onProgress' | 'signal'>,
): Promise<CutoutReply> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const worker = new Worker(
      new URL('./coinCutout.worker.ts', import.meta.url),
      { type: 'module' },
    );
    const abort = () => {
      worker.terminate();
      const reason: unknown = signal!.reason;
      reject(reason instanceof Error ? reason : new Error(String(reason)));
    };
    const settle = (settleWith: () => void) => {
      worker.terminate();
      signal?.removeEventListener('abort', abort);
      settleWith();
    };
    signal?.addEventListener('abort', abort);
    worker.onmessage = ({ data }: MessageEvent<CutoutReply>) => {
      if (data.kind === 'progress') onProgress?.(data.progress);
      else settle(() => resolve(data));
    };
    worker.onerror = (event) => {
      settle(() => reject(new Error(event.message)));
    };
    worker.postMessage(request);
  });
}

function failure(reply: CutoutReply): Error {
  if (reply.kind === 'no-coin') return new NoCoinFoundError();
  if (reply.kind === 'failed') return new Error(reply.message);
  return new Error(`Unexpected reply from the cut-out worker: ${reply.kind}`);
}

/** The coin in `file`, cut out of its background on this device: nothing leaves the browser. */
export async function cutOutCoin(
  file: Blob,
  options: CutOutOptions = {},
): Promise<CoinCutout> {
  const reply = await runInWorker(
    {
      kind: 'cut-out',
      file,
      modelUrl: coinModelUrl(),
      maxSide: options.maxSide ?? 2048,
      minFillRatio: options.minFillRatio ?? 0.9,
    },
    options,
  );
  if (reply.kind === 'cut-out') return reply.cutout;
  throw failure(reply);
}

/** Downloads and caches the model ahead of the first cut-out; only ever on the person's request. */
export async function preloadCoinModel(
  options: Pick<CutOutOptions, 'onProgress' | 'signal'> = {},
): Promise<void> {
  const reply = await runInWorker(
    { kind: 'preload', modelUrl: coinModelUrl() },
    options,
  );
  if (reply.kind !== 'preloaded') throw failure(reply);
}
