import { afterEach, describe, expect, it, vi } from 'vitest';

import { isModelCached } from './modelCache';

const MODEL_URL = 'https://example.test/models/isnet.onnx';

function cacheHolding(urls: string[]) {
  return {
    match: vi.fn(async (url: string) =>
      urls.includes(url) ? new Response('model') : undefined,
    ),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('isModelCached', () => {
  it('finds a model this browser already holds, in the model cache', async () => {
    const open = vi.fn(async () => cacheHolding([MODEL_URL]));
    vi.stubGlobal('caches', { open });

    expect(await isModelCached(MODEL_URL)).toBe(true);
    expect(open).toHaveBeenCalledWith('cb-segmentation-model');
  });

  it('misses a model it never downloaded, or one cached under an older name', async () => {
    vi.stubGlobal('caches', {
      open: vi.fn(async () =>
        cacheHolding(['https://example.test/models/older.onnx']),
      ),
    });

    expect(await isModelCached(MODEL_URL)).toBe(false);
  });

  it('counts a browser that refuses Cache Storage as not having it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const refusal = new Error('SecurityError');
    vi.stubGlobal('caches', {
      open: vi.fn(async () => {
        throw refusal;
      }),
    });

    expect(await isModelCached(MODEL_URL)).toBe(false);
    expect(warn).toHaveBeenCalledWith(
      'No Cache Storage for the segmentation model',
      refusal,
    );
  });
});
