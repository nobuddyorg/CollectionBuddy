import {
  createSignedUrls,
  SIGN_URLS_BATCH_SIZE,
  type ImageListRow,
} from '../../data/images';
import { chunk } from '../../lib/chunk';
import {
  cacheSignedUrls,
  forgetSignedUrls,
  getCachedSignedUrl,
  lastSignedUrl,
  unsignedPaths,
} from './imageCache';
import type { ImageEntry } from './types';

export type ImageEntryData = {
  id: string;
  pathFull: string;
  pathThumb?: string;
};

/** Photograph rows a page read carried, tagged with the items they cover. */
export type PageImages = { itemIdsKey: string; rows: ImageListRow[] };

/** The carried rows only for the exact item set they were read with; any other set must re-list. */
export function pageImageRowsFor(
  pageImages: PageImages | null,
  itemIdsKey: string,
): ImageListRow[] | null {
  return pageImages?.itemIdsKey === itemIdsKey ? pageImages.rows : null;
}

// Query order is preserved per item, which keeps the first photograph in the hero slot.
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

/** Plates a card can render; only these are signed up front, the rest wait for the carousel. */
export const RENDERABLE_PLATES = 1 + STRIP_MAX;

// A renderable plate is kept only once signed; later ones stay unsigned so counts still see them.
export function toImageEntries(
  entryData: Map<string, ImageEntryData>,
  signedUrlMap: ReadonlyMap<string, string | undefined>,
): ImageEntry[] {
  const entries: ImageEntry[] = [];
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
  return [...entries].flatMap((entry) =>
    entry.pathThumb ? [entry.pathFull, entry.pathThumb] : [entry.pathFull],
  );
}

// A path Storage answers without a URL is forgotten; a failed call leaves every signature as it was.
async function signBatch(
  batch: string[],
  signUrls: typeof createSignedUrls,
): Promise<void> {
  const { data: signatures, error: signError } = await signUrls(batch);
  if (signError) {
    console.error('Failed to create signed URLs', signError);
    return;
  }
  const signed = signatures
    .filter((signature) => signature.path && signature.signedUrl)
    .map(
      (signature) =>
        [signature.path as string, signature.signedUrl as string] as const,
    );
  cacheSignedUrls(signed);
  const signedPaths = new Set(signed.map(([path]) => path));
  forgetSignedUrls(batch.filter((path) => !signedPaths.has(path)));
}

// A wanted path whose signing failed keeps its last signature: a stale photograph beats none.
async function signItems(
  perItem: ReadonlyArray<readonly [string, Map<string, ImageEntryData>]>,
  { signUrls, limit }: { signUrls: typeof createSignedUrls; limit: number },
): Promise<Record<string, ImageEntry[]>> {
  const wanted = perItem.flatMap(([, entryData]) =>
    pathsOf([...entryData.values()].slice(0, limit)),
  );
  await Promise.all(
    chunk(unsignedPaths(wanted), SIGN_URLS_BATCH_SIZE).map((batch) =>
      signBatch(batch, signUrls),
    ),
  );
  const wantedPaths = new Set(wanted);

  const allPaths = perItem.flatMap(([, entryData]) =>
    pathsOf(entryData.values()),
  );
  const signedUrlMap = new Map(
    allPaths.map(
      (path) =>
        [
          path,
          wantedPaths.has(path)
            ? lastSignedUrl(path)
            : getCachedSignedUrl(path),
        ] as const,
    ),
  );

  const result: Record<string, ImageEntry[]> = {};
  for (const [itemId, entryData] of perItem) {
    result[itemId] = toImageEntries(entryData, signedUrlMap);
  }
  return result;
}

/** Signs only what the cards can render: each item's first RENDERABLE_PLATES. */
export function signEntries(
  perItem: ReadonlyArray<readonly [string, Map<string, ImageEntryData>]>,
  signUrls: typeof createSignedUrls = createSignedUrls,
): Promise<Record<string, ImageEntry[]>> {
  return signItems(perItem, { signUrls, limit: RENDERABLE_PLATES });
}

/** Signs every photograph of the given items, for the carousel. */
export function signAllEntries(
  perItem: ReadonlyArray<readonly [string, Map<string, ImageEntryData>]>,
  signUrls: typeof createSignedUrls = createSignedUrls,
): Promise<Record<string, ImageEntry[]>> {
  return signItems(perItem, { signUrls, limit: Infinity });
}

/** Back from shown entries to what signing takes, for a carousel top-up. */
export function entryDataOf(
  entries: ImageEntry[],
): Map<string, ImageEntryData> {
  return new Map(
    entries.map((entry) => [
      entry.id,
      { id: entry.id, pathFull: entry.pathFull, pathThumb: entry.pathThumb },
    ]),
  );
}

function shownPaths(entries: ImageEntry[]): string[] {
  return entries.flatMap(({ pathFull, urlFull, pathThumb, urlThumb }) =>
    [urlFull && pathFull, urlThumb && pathThumb].filter(
      (path): path is string => Boolean(path),
    ),
  );
}

/** Items showing a signature that is aged out or near it: the only ones a refresh re-signs. */
export function itemsDueForResigning(
  images: Readonly<Record<string, ImageEntry[]>>,
  now: number,
): string[] {
  return Object.entries(images)
    .filter(([, entries]) => unsignedPaths(shownPaths(entries), now).length > 0)
    .map(([itemId]) => itemId);
}

/** A failed listing blanks nothing already shown; an item never shown settles as having none. */
export function keepingShown(
  previous: Readonly<Record<string, ImageEntry[]>>,
  itemIds: string[],
): Record<string, ImageEntry[]> {
  return {
    ...Object.fromEntries(itemIds.map((itemId) => [itemId, []])),
    ...previous,
  };
}
