import {
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  type ExportManifest,
} from './exportFormat';

export class ImportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportFormatError';
  }
}

/** Checks only the format tag and version: past those, the manifest is `buildManifest`'s own. */
export function parseManifest(data: unknown): ExportManifest {
  // No `typeof data === 'object'` check: anything else has no `format` and fails the tag check.
  if (!data || (data as { format?: unknown }).format !== EXPORT_FORMAT) {
    throw new ImportFormatError('Not a CollectionBuddy export archive');
  }
  const version = (data as { version?: unknown }).version;
  if (version !== EXPORT_FORMAT_VERSION) {
    throw new ImportFormatError(
      `Cannot import a version ${String(version)} export archive`,
    );
  }
  return data as ExportManifest;
}

/** The entry ending in `/collection.json`; the importer cannot recompute the root folder's name. */
export function findManifestPath(entryNames: Iterable<string>): string | null {
  for (const name of entryNames) {
    if (name.endsWith('/collection.json')) return name;
  }
  return null;
}

/** The archive's root folder, given the path `findManifestPath` returned. */
export function rootFolderOf(manifestPath: string): string {
  return manifestPath.slice(0, -'/collection.json'.length);
}

/** One `created_at` per item, 1 ms apart, ending at `now`, so one insert keeps the archive order. */
export function importTimestamps(count: number, now: Date): string[] {
  const last = now.getTime();
  return Array.from({ length: count }, (_, i) =>
    new Date(last - (count - 1 - i)).toISOString(),
  );
}
