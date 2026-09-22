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

/** Photograph rows a page read carried, tagged with the items they cover. */
export type PageImages = { itemIdsKey: string; rows: ImageListRow[] };

/** The carried rows, but only for the exact item set they were read with --
 * any other set (an optimistic removal, a later page) must re-list. */
export function pageImageRowsFor(
  pageImages: PageImages | null,
  itemIdsKey: string,
): ImageListRow[] | null {
  return pageImages?.itemIdsKey === itemIdsKey ? pageImages.rows : null;
}

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

/** Strip cells beside the hero; photographs past them only show as "+N". */
export const STRIP_MAX = 4;

/** Plates a card can ever render: the hero plus the strip. Only these are
 * signed up front; the rest wait until the carousel opens (#630). */
export const RENDERABLE_PLATES = 1 + STRIP_MAX;

// A plate a card renders is only kept once signed, as before; one past them
// is kept unsigned, so counts and carousel navigation still see it.
export function toImgEntries(
  entryData: Map<string, ImageEntryData>,
  signedUrlMap: ReadonlyMap<string, string | undefined>,
): ImgEntry[] {
  const entries: ImgEntry[] = [];
  for (const [position, data] of [...entryData.values()].entries()) {
    const urlFull = signedUrlMap.get(data.pathFull);
    if (!urlFull && position < RENDERABLE_PLATES) continue;
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

function pathsOf(entries: Iterable<ImageEntryData>): string[] {
  return [...entries].flatMap((e) =>
    e.pathThumb ? [e.pathFull, e.pathThumb] : [e.pathFull],
  );
}

// Signs whatever isn't already cached, then hands back every item's entries
// keyed to the current signed URLs. On a signing failure, falls back to
// whatever was already cached rather than returning nothing -- a stale but
// real photograph beats none.
async function signItems(
  perItem: ReadonlyArray<readonly [string, Map<string, ImageEntryData>]>,
  { signUrls, limit }: { signUrls: typeof createSignedUrls; limit: number },
): Promise<Record<string, ImgEntry[]>> {
  const wanted = perItem.flatMap(([, entryData]) =>
    pathsOf([...entryData.values()].slice(0, limit)),
  );
  const toSign = unsignedPaths(wanted);
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

  const allPaths = perItem.flatMap(([, entryData]) =>
    pathsOf(entryData.values()),
  );
  const signedUrlMap = new Map(
    allPaths.map((path) => [path, getCachedSignedUrl(path)] as const),
  );

  const result: Record<string, ImgEntry[]> = {};
  for (const [itemId, entryData] of perItem) {
    result[itemId] = toImgEntries(entryData, signedUrlMap);
  }
  return result;
}

/** Signs only what the cards can render: each item's first RENDERABLE_PLATES. */
export function signEntries(
  perItem: ReadonlyArray<readonly [string, Map<string, ImageEntryData>]>,
  signUrls: typeof createSignedUrls = createSignedUrls,
): Promise<Record<string, ImgEntry[]>> {
  return signItems(perItem, { signUrls, limit: RENDERABLE_PLATES });
}

/** Signs every photograph of the given items, for the carousel. */
export function signAllEntries(
  perItem: ReadonlyArray<readonly [string, Map<string, ImageEntryData>]>,
  signUrls: typeof createSignedUrls = createSignedUrls,
): Promise<Record<string, ImgEntry[]>> {
  return signItems(perItem, { signUrls, limit: Infinity });
}

/** Back from shown entries to what signing takes, for a carousel top-up. */
export function entryDataOf(entries: ImgEntry[]): Map<string, ImageEntryData> {
  return new Map(
    entries.map((e) => [
      e.id,
      { id: e.id, pathFull: e.pathFull, pathThumb: e.pathThumb },
    ]),
  );
}
