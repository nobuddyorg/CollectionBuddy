import { createSignedUrls, type ImageListRow } from '../../data/images';
import {
  cacheSignedUrls,
  getCachedSignedUrl,
  unsignedPaths,
} from './imageCache';
import type { ImgEntry } from './types';

export type ImageEntryData = {
  id: string;
  pathFull: string;
  pathThumb?: string;
};

// Query order is preserved per item, which is what keeps an item's first
// photograph in the hero slot as more are added.
export function groupImageRows(
  rows: ImageListRow[],
): Map<string, Map<string, ImageEntryData>> {
  const byItem = new Map<string, Map<string, ImageEntryData>>();
  for (const row of rows) {
    const entryData =
      byItem.get(row.item_id) ?? new Map<string, ImageEntryData>();
    entryData.set(row.id, {
      id: row.id,
      pathFull: row.path_full,
      pathThumb: row.path_thumb ?? undefined,
    });
    byItem.set(row.item_id, entryData);
  }
  return byItem;
}

export function toImgEntries(
  entryData: Map<string, ImageEntryData>,
  signedUrlMap: ReadonlyMap<string, string | undefined>,
): ImgEntry[] {
  const entries: ImgEntry[] = [];
  for (const data of entryData.values()) {
    const urlFull = signedUrlMap.get(data.pathFull);
    if (!urlFull) continue;
    entries.push({
      id: data.id,
      pathFull: data.pathFull,
      urlFull,
      pathThumb: data.pathThumb,
      urlThumb: data.pathThumb ? signedUrlMap.get(data.pathThumb) : undefined,
    });
  }
  return entries;
}

// Signs whatever isn't already cached, then hands back every item's entries
// keyed to the current signed URLs. On a signing failure, falls back to
// whatever was already cached rather than returning nothing -- a stale but
// real photograph beats none.
export async function signEntries(
  perItem: ReadonlyArray<readonly [string, Map<string, ImageEntryData>]>,
  // Stryker disable next-line all
  // v8 ignore next
  signUrls: typeof createSignedUrls = createSignedUrls,
): Promise<Record<string, ImgEntry[]>> {
  const allPaths = perItem.flatMap(([, entryData]) =>
    Array.from(entryData.values()).flatMap((e) =>
      e.pathThumb ? [e.pathFull, e.pathThumb] : [e.pathFull],
    ),
  );

  const toSign = unsignedPaths(allPaths);
  if (toSign.length > 0) {
    const { data: signedUrls, error: signError } = await signUrls(toSign);
    if (signError) {
      console.error('Failed to create signed URLs', signError);
    } else {
      cacheSignedUrls(
        signedUrls
          .filter((s) => s.path && s.signedUrl)
          .map((s) => [s.path as string, s.signedUrl as string] as const),
      );
    }
  }

  const signedUrlMap = new Map(
    allPaths.map((path) => [path, getCachedSignedUrl(path)] as const),
  );

  const result: Record<string, ImgEntry[]> = {};
  for (const [itemId, entryData] of perItem) {
    result[itemId] = toImgEntries(entryData, signedUrlMap);
  }
  return result;
}
