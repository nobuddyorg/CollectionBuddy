/**
 * Building one category's archive, end to end.
 *
 * There is no server to do this on -- the app is a static export and
 * authorization lives entirely in Row Level Security -- so the whole
 * archive is assembled in the tab: rows over PostgREST, photographs over
 * signed URLs, zipped by `./zip` and handed to the browser as a download.
 *
 * The shape of what comes out is `./exportFormat`'s business, and the ZIP
 * bytes are `./zip`'s. What is left here is the I/O and the order it
 * happens in, which is why this file is exempt from the coverage floor
 * while both of those are held to 100%.
 */

import { supabase } from '../supabase';
import {
  createSignedUrls,
  listAllImageObjects,
  ITEM_IMAGES_BUCKET,
} from './images';
import { listItemsForExport } from './items';
import {
  archiveName,
  buildCsv,
  buildManifest,
  CSV_NAME,
  exportEntries,
  fullSizeObjectPaths,
  MANIFEST_NAME,
  type ExportItem,
} from './exportFormat';
import { createZipWriter } from './zip';

/**
 * How far an export has got. `total` is only known once the items are in
 * and their photographs counted, so it is 0 for the first phase.
 */
export type ExportProgress = {
  phase: 'items' | 'photos' | 'packing';
  done: number;
  total: number;
};

export type ExportResult = {
  blob: Blob;
  filename: string;
  itemCount: number;
  /** Photographs actually written to the archive -- not photographs attempted. */
  photoCount: number;
  /** Photographs that could not be fetched after retrying, and were left out. */
  skippedPhotoCount: number;
};

/**
 * PostgREST caps a response, and a collection can be larger than one page,
 * so items are walked a page at a time until a short page ends it.
 */
const ITEM_PAGE_SIZE = 500;

/**
 * How many photographs are signed in one call. Signing is cheap but the
 * URL list is not unbounded, and a batch that fails takes only its own
 * photographs down with it.
 */
const SIGN_BATCH_SIZE = 100;

/**
 * Signed URLs last an hour by default. An export of a large collection on
 * a slow connection can outlive that, so they are asked for with room to
 * spare -- a URL that expires mid-download would fail a photograph that
 * was otherwise perfectly readable.
 */
const SIGNED_URL_TTL_SECONDS = 6 * 3600;

/* v8 ignore start -- Supabase and fetch I/O, and the error type it raises.
 * The manifest, the CSV, the names and the ZIP bytes are all built by pure
 * functions in ./exportFormat and ./zip, which is where the risk is and
 * where the floors are. */
// Stryker disable all: I/O orchestration; the pure halves it calls are what
// is scored.

export class ExportError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ExportError';
  }
}

async function fetchAllItems(categoryId: string): Promise<ExportItem[]> {
  const items: ExportItem[] = [];
  for (let page = 0; ; page++) {
    const from = page * ITEM_PAGE_SIZE;
    const { data, error } = await listItemsForExport(
      categoryId,
      from,
      from + ITEM_PAGE_SIZE - 1,
    );
    if (error) throw new ExportError('Could not read items', { cause: error });
    if (!data?.length) break;
    items.push(...data);
    if (data.length < ITEM_PAGE_SIZE) break;
  }
  return items;
}

async function fetchPhotoPaths(
  uid: string,
  items: ExportItem[],
): Promise<Map<string, string[]>> {
  // Storage has no listing that crosses prefixes, so this is one call per
  // item however it is written -- but they need not wait on each other.
  const listings = await Promise.all(
    items.map(async (item) => {
      const prefix = `${uid}/${item.id}`;
      const { data, error } = await listAllImageObjects(prefix);
      if (error) {
        throw new ExportError('Could not list photographs', { cause: error });
      }
      return [item.id, fullSizeObjectPaths(prefix, data ?? [])] as const;
    }),
  );
  return new Map(listings);
}

/**
 * How many times a photograph's fetch is retried, and the backoff between
 * attempts. The geocoder already gets three tries with backoff for the same
 * reason: over an export of hundreds of photographs, a radio blip, a 5xx or
 * a rate limit is common enough that one failed request must not mean one
 * permanently missing photograph (#414).
 */
const PHOTO_FETCH_ATTEMPTS = 3;
const PHOTO_RETRY_BASE_MS = 500;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/** Distinguishes a response retrying cannot fix (a 404 is a 404 three times over). */
class PermanentFetchError extends Error {}

async function fetchPhotoBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < PHOTO_FETCH_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, PHOTO_RETRY_BASE_MS * 2 ** (attempt - 1)),
      );
    }
    try {
      const response = await fetch(url);
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
      if (!isRetryableStatus(response.status)) {
        throw new PermanentFetchError(`HTTP ${response.status}`);
      }
      lastErr = new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (err instanceof PermanentFetchError) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

async function signAll(paths: string[]): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  for (let i = 0; i < paths.length; i += SIGN_BATCH_SIZE) {
    const batch = paths.slice(i, i + SIGN_BATCH_SIZE);
    const { data, error } = await createSignedUrls(
      batch,
      SIGNED_URL_TTL_SECONDS,
    );
    if (error) {
      throw new ExportError('Could not sign photograph URLs', { cause: error });
    }
    for (const row of data ?? []) {
      if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
    }
  }
  return signed;
}

/**
 * Builds the archive for one category.
 *
 * A photograph that still cannot be fetched after retrying is reported and
 * skipped rather than failing the export: an archive missing one picture is
 * worth having, and the manifest still names what should have been there,
 * so the gap is visible in the archive itself as well as in
 * `skippedPhotoCount` -- silently is the one way it must not go missing,
 * since the canonical use of an export is "export, then delete the
 * originals" (#414).
 */
export async function exportCategory({
  category,
  onProgress,
  now = () => new Date(),
}: {
  category: { id: string; name: string };
  onProgress?: (progress: ExportProgress) => void;
  now?: () => Date;
}): Promise<ExportResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const uid = sessionData.session?.user.id;
  if (!uid) throw new ExportError('No user session');

  onProgress?.({ phase: 'items', done: 0, total: 0 });
  const items = await fetchAllItems(category.id);

  const photoPathsByItemId = await fetchPhotoPaths(uid, items);
  const entries = exportEntries(items, photoPathsByItemId);

  const storagePaths = items.flatMap(
    (item) => photoPathsByItemId.get(item.id) ?? [],
  );
  const signed = await signAll(storagePaths);

  const exportedAt = now();
  const writer = createZipWriter();
  let done = 0;
  let skipped = 0;
  const total = storagePaths.length;
  onProgress?.({ phase: 'photos', done, total });

  // One photograph at a time, on purpose. Fetching them in parallel would
  // hold every response in memory at once; the writer is built so that
  // each set of bytes becomes a Blob and stops being heap the moment it is
  // added, and that only helps if they arrive one after another.
  for (const entry of entries) {
    const stored = photoPathsByItemId.get(entry.item.id) ?? [];
    for (let i = 0; i < stored.length; i++) {
      const url = signed.get(stored[i]);
      try {
        if (!url) throw new Error(`Unsigned path in ${ITEM_IMAGES_BUCKET}`);
        const bytes = await fetchPhotoBytes(url);
        writer.add(entry.photos[i], bytes, exportedAt);
      } catch (err) {
        console.error('Skipping photograph', stored[i], err);
        skipped++;
      }
      onProgress?.({ phase: 'photos', done: ++done, total });
    }
  }

  onProgress?.({ phase: 'packing', done: total, total });

  const encoder = new TextEncoder();
  const manifest = buildManifest({ category, entries, exportedAt });
  writer.add(
    MANIFEST_NAME,
    encoder.encode(JSON.stringify(manifest, null, 2)),
    exportedAt,
  );
  writer.add(CSV_NAME, encoder.encode(buildCsv(entries)), exportedAt);

  return {
    blob: writer.finish(),
    filename: archiveName(category.name, exportedAt),
    itemCount: items.length,
    photoCount: total - skipped,
    skippedPhotoCount: skipped,
  };
}

/** Hands a finished archive to the browser as a download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoked on the next turn rather than immediately: Safari has been known
  // to cancel a download whose object URL is released in the same tick as
  // the click that started it.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
// Stryker restore all
/* v8 ignore stop */
