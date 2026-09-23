import type { ExportItemRow } from './exportItemPages';

/** The item fields an export carries, plus when it was catalogued. */
export type ExportItem = ExportItemRow;

/** One photograph: where it lives in storage, and where it belongs in the archive. */
type ExportPhoto = {
  storagePath: string;
  archivePath: string;
};

/** An item paired with its photographs, storage and archive path together. */
export type ExportEntry = {
  item: ExportItem;
  /** Directory name under `photos/`, unique within the archive. */
  folder: string;
  /** In the order the app hangs the photographs in. */
  photos: ExportPhoto[];
};

export const EXPORT_FORMAT = 'collectionbuddy-category-export';
export const EXPORT_FORMAT_VERSION = 1;
export const PHOTOS_DIR = 'photos';
export const MANIFEST_NAME = 'collection.json';
export const CSV_NAME = 'collection.csv';

/** Keeps the deepest export path inside every extractor's ~255-byte component limit. */
const MAX_SLUG_LENGTH = 60;

/** What a title slugs to when it has no characters a file name can keep. */
const EMPTY_SLUG = 'untitled';

/** A title as a path component safe on every platform; diacritics dropped, not transliterated. */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    // Strip combining marks left behind by the decomposition above.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    // The slice can land on the separator between two words and leave it hanging.
    .replace(/-$/g, '');
  return slug || EMPTY_SLUG;
}

/** `001`, `002`, ... wide enough that an alphabetical file manager keeps the app's order. */
export function indexPrefix(index: number, total: number): string {
  const width = Math.max(3, String(total).length);
  return String(index + 1).padStart(width, '0');
}

/** Rejects anything a storage object name could smuggle into an archive path unescaped. */
const SAFE_EXTENSION = /^[A-Za-z0-9]{1,10}$/;

/** `.webp`, `.jpg`, ... off a storage object name; `.bin` when absent or implausible. */
export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return '.bin';
  const extension = name.slice(dot + 1);
  return SAFE_EXTENSION.test(extension) ? `.${extension}` : '.bin';
}

/** Pairs each item with a folder unique by position, since two items may share a title. */
export function exportEntries(
  items: ExportItem[],
  photoPathsByItemId: Map<string, string[]>,
): ExportEntry[] {
  return items.map((item, index) => {
    const folder = `${indexPrefix(index, items.length)}-${slugify(item.title)}`;
    const stored = photoPathsByItemId.get(item.id) ?? [];
    const photos = stored.map((storagePath, i) => ({
      storagePath,
      archivePath: `${PHOTOS_DIR}/${folder}/${i + 1}${extensionOf(storagePath)}`,
    }));
    return { item, folder, photos };
  });
}

export type ExportManifest = {
  format: typeof EXPORT_FORMAT;
  version: number;
  exported_at: string;
  category: { id: string; name: string };
  items: (ExportItem & { folder: string; photos: string[] })[];
};

/** The full-fidelity half of the archive; ids are kept as a future import's merge identity. */
export function buildManifest({
  category,
  entries,
  exportedAt,
}: {
  category: { id: string; name: string };
  entries: ExportEntry[];
  exportedAt: Date;
}): ExportManifest {
  return {
    format: EXPORT_FORMAT,
    version: EXPORT_FORMAT_VERSION,
    exported_at: exportedAt.toISOString(),
    category,
    items: entries.map(({ item, folder, photos }) => ({
      ...item,
      folder,
      photos: photos.map((photo) => photo.archivePath),
    })),
  };
}

export const CSV_COLUMNS = [
  'title',
  'description',
  'place',
  'latitude',
  'longitude',
  'tags',
  'photos',
  'folder',
  'created_at',
  'id',
] as const;

/** Leading characters a spreadsheet evaluates as a formula; an apostrophe prefix keeps them text. */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** RFC 4180 quoting only: guarding app-generated cells would turn a negative coordinate into text. */
function plainCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** A user-authored text cell -- quoted, and guarded against formula injection. */
export function csvCell(value: string): string {
  const guarded = FORMULA_LEAD.test(value) ? `'${value}` : value;
  return plainCell(guarded);
}

function csvRow(values: string[]): string {
  return values.join(',');
}

/** A number as a cell, or an empty cell -- never the string "null". */
function numberCell(value: number | null): string {
  return value === null ? '' : plainCell(String(value));
}

/** CRLF and a byte-order mark: without them Excel opens a UTF-8 CSV as the local code page. */
export function buildCsv(entries: ExportEntry[]): string {
  const rows = entries.map(({ item, folder, photos }) =>
    csvRow([
      csvCell(item.title),
      csvCell(item.description ?? ''),
      csvCell(item.place ?? ''),
      numberCell(item.place_lat),
      numberCell(item.place_lng),
      csvCell(item.tags.join(', ')),
      plainCell(photos.map((photo) => photo.archivePath).join(' ')),
      plainCell(folder),
      plainCell(item.created_at),
      plainCell(item.id),
    ]),
  );
  return `﻿${[csvRow(CSV_COLUMNS.map(plainCell)), ...rows].join('\r\n')}\r\n`;
}

/** A byte count as a rounded gigabyte figure -- "about 1.6 GB". */
export function formatExportBytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** `2026-08-06`, in the exporter's own timezone rather than UTC. */
export function localDateStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The download's name and its one root directory, so a non-wrapping extractor keeps it apart. */
function archiveBaseName(categoryName: string, exportedAt: Date): string {
  return `CollectionBuddy-${slugify(categoryName)}-${localDateStamp(exportedAt)}`;
}

/** What the download is called; slugged like a folder since it becomes a file name too. */
export function archiveName(categoryName: string, exportedAt: Date): string {
  return `${archiveBaseName(categoryName, exportedAt)}.zip`;
}

/** The one top-level directory every entry in the archive is written under. */
export function archiveRootFolder(
  categoryName: string,
  exportedAt: Date,
): string {
  return archiveBaseName(categoryName, exportedAt);
}
