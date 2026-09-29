import {
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  MANIFEST_NAME,
} from './exportFormat';

/** Why an archive cannot be imported as it is: not an export, unreadable as a ZIP, or past a size limit. */
export type ImportFormatReason = 'not_export' | 'unreadable' | 'too_large';

/** The archive's own fault, which no retry fixes. */
export class ImportFormatError extends Error {
  readonly reason: ImportFormatReason;

  constructor({
    reason,
    message,
    ...options
  }: {
    reason: ImportFormatReason;
    message: string;
    cause?: unknown;
  }) {
    super(message, options);
    this.name = 'ImportFormatError';
    this.reason = reason;
  }
}

/** The manifest fields the import reads; the rest (ids, folders, dates) it never trusts. */
export type ManifestItem = {
  title: string;
  description: string | null;
  place: string | null;
  place_lat: number | null;
  place_lng: number | null;
  tags: string[];
  photos: string[];
};

export type ImportManifest = {
  category: { name: string };
  items: ManifestItem[];
};

const isString = (value: unknown): value is string => typeof value === 'string';

const isStringOrNull = (value: unknown) => value === null || isString(value);

const isNumberOrNull = (value: unknown) =>
  value === null || typeof value === 'number';

const isStringList = (value: unknown) =>
  Array.isArray(value) && value.every(isString);

function isManifestItem(value: unknown): value is ManifestItem {
  const item = (value ?? {}) as Record<string, unknown>;
  return (
    isString(item.title) &&
    isStringOrNull(item.description) &&
    isStringOrNull(item.place) &&
    isNumberOrNull(item.place_lat) &&
    isNumberOrNull(item.place_lng) &&
    isStringList(item.tags) &&
    isStringList(item.photos)
  );
}

function notAnExport(message: string): ImportFormatError {
  return new ImportFormatError({ reason: 'not_export', message });
}

/** Checks the format tag, the version and the shape of every field the import goes on to read. */
export function parseManifest(data: unknown): ImportManifest {
  // No `typeof data === 'object'` check: anything else has no `format` and fails the tag check.
  if (!data || (data as { format?: unknown }).format !== EXPORT_FORMAT) {
    throw notAnExport('Not a CollectionBuddy export archive');
  }
  const { version, category, items } = data as Record<string, unknown>;
  if (version !== EXPORT_FORMAT_VERSION) {
    throw notAnExport(
      `Cannot import a version ${String(version)} export archive`,
    );
  }
  if (!isString((category as { name?: unknown } | null)?.name)) {
    throw notAnExport('The manifest names no category');
  }
  if (!Array.isArray(items) || !items.every(isManifestItem)) {
    throw notAnExport('The manifest has a malformed entry');
  }
  return data as ImportManifest;
}

const MANIFEST_SUFFIX = `/${MANIFEST_NAME}`;

const isManifestPath = (name: string) =>
  name === MANIFEST_NAME || name.endsWith(MANIFEST_SUFFIX);

/** The one `collection.json`: in the export's folder, whose name the importer cannot recompute, or at the root of an archive of its contents. */
export function findManifestPath(entryNames: Iterable<string>): string {
  const manifests = Array.from(entryNames).filter(isManifestPath);
  if (manifests.length === 0) {
    throw notAnExport('Not a CollectionBuddy export archive');
  }
  // Two would leave it to guesswork which photographs belong to which.
  if (manifests.length > 1) {
    throw notAnExport('More than one collection.json in this archive');
  }
  return manifests[0];
}

/** What the manifest's photo paths are relative to: its folder with the trailing slash, or nothing at the archive root. */
export function archivePrefixOf(manifestPath: string): string {
  return manifestPath.slice(0, -MANIFEST_NAME.length);
}

/** One `created_at` per row, 1 ms apart, ending at `now`, so any insert order keeps the archive order. */
export function importTimestamps(count: number, now: Date): string[] {
  const last = now.getTime();
  return Array.from({ length: count }, (_, i) =>
    new Date(last - (count - 1 - i)).toISOString(),
  );
}

export type PhotoTask = {
  itemId: string;
  archivePath: string;
  createdAt: string;
};

/** Stamped per item in manifest order: photographs read oldest-first, so the first stays the cover. */
export function importPhotoTasks(
  items: { id: string; item: { photos: string[] } }[],
  now: Date,
): PhotoTask[] {
  // An export names each photograph once; a repeat would only upload the same bytes into the quota again.
  const seen = new Set<string>();
  return items.flatMap(({ id, item }) => {
    const photos = [...new Set(item.photos)].filter(
      (archivePath) => !seen.has(archivePath),
    );
    photos.forEach((archivePath) => seen.add(archivePath));
    const createdAts = importTimestamps(photos.length, now);
    return photos.map((archivePath, i) => ({
      itemId: id,
      archivePath,
      createdAt: createdAts[i],
    }));
  });
}
