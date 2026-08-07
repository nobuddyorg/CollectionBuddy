/**
 * How a category becomes an archive: the names, the manifest and the
 * spreadsheet. Everything here is a pure function of rows the caller has
 * already fetched, so the shape of an export can be tested without a
 * database, a session or a browser.
 *
 * The archive an export produces looks like this:
 *
 *   CollectionBuddy-coins-2026-08-06/
 *     collection.json      -- every field, enough to re-import from
 *     collection.csv       -- the same rows, for a spreadsheet
 *     photos/001-1855-seated-dime/1.webp
 *     photos/001-1855-seated-dime/2.webp
 *     photos/002-silver-eagle/1.webp
 *
 * Two readers, two files. The JSON is the one that keeps its meaning --
 * tags stay a list, coordinates stay numbers, an absent description stays
 * absent rather than becoming an empty cell. The CSV is the one anyone can
 * open, and it pays for that by flattening all of the above into text.
 */

import type { ExportItemRow } from './items';

/** The item fields an export carries, plus when it was catalogued. */
export type ExportItem = ExportItemRow;

/** An item paired with the archive-relative paths of its photographs. */
export type ExportEntry = {
  item: ExportItem;
  /** Directory name under `photos/`, unique within the archive. */
  folder: string;
  /** Full archive paths, in the order the app hangs the photographs in. */
  photos: string[];
};

export const EXPORT_FORMAT = 'collectionbuddy-category-export';
export const EXPORT_FORMAT_VERSION = 1;
export const PHOTOS_DIR = 'photos';
export const MANIFEST_NAME = 'collection.json';
export const CSV_NAME = 'collection.csv';

/**
 * How much of a title survives into a folder name. Long enough to stay
 * recognisable, short enough that the deepest path an export can produce
 * -- root, `photos/`, folder, file -- stays well inside the ~255 byte
 * component limit every extractor has, and inside Windows' path budget.
 */
const MAX_SLUG_LENGTH = 60;

/** What a title slugs to when it has no characters a file name can keep. */
const EMPTY_SLUG = 'untitled';

/**
 * A title reduced to something safe as a path component on every platform.
 *
 * Diacritics are decomposed and dropped rather than transliterated, so
 * "Münze" becomes "munze": an approximation, but a stable one, and the
 * exact title is still in the manifest beside it. The item's number in the
 * archive is what actually makes the name unique -- see `exportEntries`.
 */
export function slugify(title: string): string {
  const slug = title
    .normalize('NFKD')
    // Strip combining marks left behind by the decomposition above.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    // A single `-`, not a run: the collapse above has already left at most
    // one separator at either end, so there is never more than one to trim.
    .replace(/^-|-$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    // And once more, because the slice can land on the separator between
    // two words and leave it hanging off the end.
    .replace(/-$/g, '');
  return slug || EMPTY_SLUG;
}

/**
 * `001`, `002`, ... -- wide enough for the whole export, so a file manager
 * sorting names alphabetically reproduces the order the app listed them
 * in. Three digits minimum, more only if there are more than 999 items.
 */
export function indexPrefix(index: number, total: number): string {
  const width = Math.max(3, String(total).length);
  return String(index + 1).padStart(width, '0');
}

/** `.webp`, `.jpg`, ... taken off a storage object name, `.bin` if it has none. */
export function extensionOf(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '.bin';
}

/**
 * The storage paths of an item's photographs, thumbnails left behind.
 *
 * A thumbnail is a 400px derivative this app generated for its own contact
 * strip -- see useItemImages -- not a second picture the user took. Putting
 * both in the archive would double its weight to deliver every photograph
 * twice, once at a size nobody asked for.
 */
export function fullSizeObjectPaths(
  prefix: string,
  objects: { name: string }[],
): string[] {
  return objects
    .filter((o) => !o.name.endsWith('.thumb.webp'))
    .map((o) => `${prefix}/${o.name}`);
}

/**
 * Pairs each item with its folder and the archive path of every
 * photograph, numbering both.
 *
 * The number prefix is not decoration: two items may legitimately share a
 * title, and an export that quietly merged their photographs into one
 * folder would be wrong in a way nobody would notice until they went
 * looking for a picture. Prefixing by position makes every name unique by
 * construction rather than by collision check.
 */
export function exportEntries(
  items: ExportItem[],
  photoPathsByItemId: Map<string, string[]>,
): ExportEntry[] {
  return items.map((item, index) => {
    const folder = `${indexPrefix(index, items.length)}-${slugify(item.title)}`;
    const stored = photoPathsByItemId.get(item.id) ?? [];
    const photos = stored.map(
      (storagePath, i) =>
        `${PHOTOS_DIR}/${folder}/${i + 1}${extensionOf(storagePath)}`,
    );
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

/**
 * The full-fidelity half of the archive.
 *
 * Ids are kept even though nothing outside this database can resolve them:
 * they are what would let a future import tell "the same item again" from
 * "a second item that happens to match", and dropping them now would make
 * every existing archive useless for that.
 */
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
      photos,
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

/**
 * Characters a spreadsheet treats as the start of a formula rather than as
 * text. A title is user-entered, so `=HYPERLINK(...)` in one is a value
 * this app stored faithfully and must not hand to Excel as something to
 * evaluate -- the cell is prefixed with an apostrophe, which spreadsheets
 * read as "the rest is literal" and strip on display.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  const guarded = FORMULA_LEAD.test(value) ? `'${value}` : value;
  // RFC 4180: quote when the value contains a delimiter, a quote or a line
  // break, and double any quote inside it.
  return /[",\r\n]/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}

function csvRow(values: string[]): string {
  return values.map(csvCell).join(',');
}

/** A number as a cell, or an empty cell -- never the string "null". */
function numberCell(value: number | null): string {
  return value === null ? '' : String(value);
}

/**
 * The archive's spreadsheet half.
 *
 * CRLF line endings and a leading byte-order mark, both for the same
 * reason: without them Excel opens a UTF-8 CSV as the local code page and
 * turns every umlaut in a German collection into mojibake.
 */
export function buildCsv(entries: ExportEntry[]): string {
  const rows = entries.map(({ item, folder, photos }) =>
    csvRow([
      item.title,
      item.description ?? '',
      item.place ?? '',
      numberCell(item.place_lat),
      numberCell(item.place_lng),
      item.tags.join(', '),
      photos.join(' '),
      folder,
      item.created_at,
      item.id,
    ]),
  );
  return `\ufeff${[csvRow([...CSV_COLUMNS]), ...rows].join('\r\n')}\r\n`;
}

/** `2026-08-06`, in the exporter's own timezone rather than UTC. */
export function localDateStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * What the download is called. The category name is slugged the same way a
 * folder is, because this string ends up as a file name on the same range
 * of filesystems.
 */
export function archiveName(categoryName: string, exportedAt: Date): string {
  return `CollectionBuddy-${slugify(categoryName)}-${localDateStamp(exportedAt)}.zip`;
}
