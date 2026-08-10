/**
 * The read side of ./exportFormat: turning an archive's `collection.json`
 * back into rows this app can create, and the archive's own root folder
 * back into something photo paths can be resolved against.
 *
 * Deliberately narrow. An import only ever reads what an export of *this*
 * app wrote -- there is no other producer to be lenient towards -- so
 * validation exists to give someone a clear reason their file was refused
 * (a JSON export from a different tool, an archive from a future version of
 * this one), not to accept a wide range of possible shapes.
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
 * Validates and narrows already-parsed JSON into an `ExportManifest`.
 *
 * Only checks what tells a real export apart from anything else: the
 * format tag and the version number. It does not otherwise validate every
 * field's shape -- a manifest that passes both of those was written by
 * `buildManifest` in some version of this app, and `buildManifest`'s own
 * shape is what's trusted for everything past that point.
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
 * The one directory every entry in the archive lives under (matches
 * `archiveRootFolder` on the export side) -- found by looking for whichever
 * entry ends in `/collection.json` rather than recomputing the name from
 * the category and export date, both of which the importer doesn't know
 * ahead of reading the manifest they're stamped into.
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
