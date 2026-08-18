/**
 * The read side of ./exportFormat. Deliberately narrow: an import only
 * ever reads what an export of *this* app wrote, so validation exists to
 * give a clear refusal reason, not to accept a wide range of shapes.
 */

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

/**
 * Validates and narrows already-parsed JSON into an `ExportManifest`. Only
 * checks the format tag and version number -- a manifest passing both was
 * written by `buildManifest`, whose own shape is trusted past that point.
 */
export function parseManifest(data: unknown): ExportManifest {
  if (
    !data ||
    typeof data !== 'object' ||
    (data as { format?: unknown }).format !== EXPORT_FORMAT
  ) {
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

/**
 * The one directory every entry lives under, found by looking for whichever
 * entry ends in `/collection.json` -- the importer doesn't know the
 * category/date the name would otherwise be recomputed from.
 */
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
