// Outside sw.js's `collectionbuddy-` prefix, whose per-build sweep would re-download 90 MB after every deploy.
const MODEL_CACHE = 'cb-segmentation-model';

/** The model's own cache; undefined where the browser refuses Cache Storage (a private window, say). */
export async function openModelCache(): Promise<Cache | undefined> {
  try {
    return await caches.open(MODEL_CACHE);
  } catch (error: unknown) {
    console.warn('No Cache Storage for the segmentation model', error);
    return undefined;
  }
}

/** Whether this browser already holds the model at `url`, so a cut-out needs no download. */
export async function isModelCached(url: string): Promise<boolean> {
  const cache = await openModelCache();
  return (await cache?.match(url)) !== undefined;
}
