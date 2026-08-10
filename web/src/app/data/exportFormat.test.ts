import { describe, expect, it } from 'vitest';

import {
  archiveName,
  archiveRootFolder,
  buildCsv,
  buildManifest,
  csvCell,
  CSV_COLUMNS,
  CSV_NAME,
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  exportEntries,
  extensionOf,
  fullSizeObjectPaths,
  indexPrefix,
  localDateStamp,
  MANIFEST_NAME,
  PHOTOS_DIR,
  slugify,
  type ExportItem,
} from './exportFormat';

function item(overrides: Partial<ExportItem> = {}): ExportItem {
  return {
    id: 'item-1',
    title: 'Seated Dime',
    description: null,
    place: null,
    place_lat: null,
    place_lng: null,
    tags: [],
    created_at: '2026-01-02T03:04:05.000Z',
    ...overrides,
  };
}

describe('slugify', () => {
  it('lowercases and joins words with a single separator', () => {
    expect(slugify('1855 Seated Dime')).toBe('1855-seated-dime');
  });

  it('collapses a run of unusable characters into one separator', () => {
    expect(slugify('a  ///  b')).toBe('a-b');
  });

  it('strips diacritics rather than dropping the letter under them', () => {
    expect(slugify('Münze')).toBe('munze');
    expect(slugify('Café Crème')).toBe('cafe-creme');
  });

  it('trims separators from both ends', () => {
    expect(slugify('  ...coin...  ')).toBe('coin');
  });

  it('falls back for a title with nothing a file name can keep', () => {
    expect(slugify('🪙')).toBe('untitled');
    expect(slugify('   ')).toBe('untitled');
    expect(slugify('')).toBe('untitled');
  });

  it('caps the length', () => {
    expect(slugify('a'.repeat(80))).toBe('a'.repeat(60));
  });

  it('never ends on the separator the cap cut it at', () => {
    // 'ab ' repeated puts a separator on exactly the 60th character, so
    // the cut lands mid-word and leaves one dangling.
    const slug = slugify('ab '.repeat(40));
    expect(slug).toBe('ab-'.repeat(19) + 'ab');
    expect(slug).toHaveLength(59);
  });

  it('keeps digits, which are often the whole title', () => {
    expect(slugify('1889 CC')).toBe('1889-cc');
  });
});

describe('indexPrefix', () => {
  it('numbers from one, not from zero', () => {
    expect(indexPrefix(0, 5)).toBe('001');
  });

  it('pads to three digits so a file manager sorts the archive in order', () => {
    expect(indexPrefix(8, 12)).toBe('009');
    expect(indexPrefix(11, 12)).toBe('012');
  });

  it('widens past three digits only when the collection needs it', () => {
    expect(indexPrefix(0, 999)).toBe('001');
    expect(indexPrefix(0, 1000)).toBe('0001');
    expect(indexPrefix(1233, 1234)).toBe('1234');
  });
});

describe('extensionOf', () => {
  it('takes the extension off a storage path', () => {
    expect(extensionOf('uid/item/abc.webp')).toBe('.webp');
    expect(extensionOf('uid/item/abc.thumb.webp')).toBe('.webp');
    expect(extensionOf('a.JPG')).toBe('.JPG');
  });

  it('falls back for a name with no extension at all', () => {
    expect(extensionOf('uid/item/abc')).toBe('.bin');
  });

  it('does not mistake a dotfile’s leading dot for an extension', () => {
    expect(extensionOf('uid/item/.hidden')).toBe('.bin');
  });

  it('does not read an extension out of a directory name', () => {
    expect(extensionOf('uid/some.dir/abc')).toBe('.bin');
  });

  // Folder names are slugified to [a-z0-9-], but the extension used to be
  // copied verbatim off the storage object name into the archive path.
  // Not exploitable as found -- this app only ever uploads
  // `<uuid>.webp`/`.thumb.webp`, and storage RLS keys every verb on the
  // uid prefix -- but a backslash in an entry path is a path separator to
  // Windows Explorer's extractor, and quotes/trailing dots make the file
  // fail to extract there even without one.
  it('falls back for an extension containing a path separator', () => {
    expect(extensionOf('uid/item/x.a\\..\\evil')).toBe('.bin');
  });

  it('falls back for an extension carrying a quote, space or trailing dot', () => {
    expect(extensionOf('uid/item/a.jpg"')).toBe('.bin');
    expect(extensionOf('uid/item/a.j pg')).toBe('.bin');
    expect(extensionOf('uid/item/a.jpg.')).toBe('.bin');
  });

  it('falls back for an implausibly long extension', () => {
    expect(extensionOf('uid/item/a.' + 'x'.repeat(11))).toBe('.bin');
  });
});

describe('fullSizeObjectPaths', () => {
  it('prefixes the names it keeps', () => {
    expect(fullSizeObjectPaths('uid/item', [{ name: 'a.webp' }])).toEqual([
      'uid/item/a.webp',
    ]);
  });

  it('leaves the app’s own thumbnails out of the archive', () => {
    expect(
      fullSizeObjectPaths('uid/item', [
        { name: 'a.webp' },
        { name: 'a.thumb.webp' },
        { name: 'b.webp' },
        { name: 'b.thumb.webp' },
      ]),
    ).toEqual(['uid/item/a.webp', 'uid/item/b.webp']);
  });

  it('keeps the listing order it was given', () => {
    expect(
      fullSizeObjectPaths('p', [{ name: 'z.webp' }, { name: 'a.webp' }]),
    ).toEqual(['p/z.webp', 'p/a.webp']);
  });

  it('is empty for an item with no photographs', () => {
    expect(fullSizeObjectPaths('uid/item', [])).toEqual([]);
  });
});

describe('exportEntries', () => {
  it('numbers each folder and each photograph inside it', () => {
    const entries = exportEntries(
      [item({ id: 'a', title: 'Seated Dime' })],
      new Map([['a', ['uid/a/one.webp', 'uid/a/two.webp']]]),
    );
    expect(entries[0].folder).toBe('001-seated-dime');
    expect(entries[0].photos).toEqual([
      {
        storagePath: 'uid/a/one.webp',
        archivePath: `${PHOTOS_DIR}/001-seated-dime/1.webp`,
      },
      {
        storagePath: 'uid/a/two.webp',
        archivePath: `${PHOTOS_DIR}/001-seated-dime/2.webp`,
      },
    ]);
  });

  // #421: each photo carries its own storage path and archive path
  // together, built once here, rather than two arrays a caller has to zip
  // back up by index -- so there is no positional invariant left to break.
  it('pairs each photograph with the exact storage path it came from', () => {
    const entries = exportEntries(
      [item({ id: 'a' })],
      new Map([['a', ['uid/a/one.webp', 'uid/a/two.webp']]]),
    );
    expect(entries[0].photos.map((p) => p.storagePath)).toEqual([
      'uid/a/one.webp',
      'uid/a/two.webp',
    ]);
  });

  it('keeps two items of the same title in folders of their own', () => {
    const entries = exportEntries(
      [item({ id: 'a', title: 'Coin' }), item({ id: 'b', title: 'Coin' })],
      new Map([
        ['a', ['uid/a/x.webp']],
        ['b', ['uid/b/y.webp']],
      ]),
    );
    expect(entries[0].folder).not.toBe(entries[1].folder);
    expect(entries.map((e) => e.folder)).toEqual(['001-coin', '002-coin']);
    // The whole point of the numbering: neither item's photograph can land
    // on top of the other's.
    expect(entries[0].photos[0].archivePath).not.toBe(
      entries[1].photos[0].archivePath,
    );
  });

  it('gives an item with no photographs an empty list, not a missing one', () => {
    const entries = exportEntries([item({ id: 'a' })], new Map());
    expect(entries[0].photos).toEqual([]);
    expect(entries[0].folder).toBe('001-seated-dime');
  });

  it('carries the item through untouched', () => {
    const original = item({ id: 'a', tags: ['silver'] });
    expect(exportEntries([original], new Map())[0].item).toEqual(original);
  });

  it('takes each photograph’s extension from the object it came from', () => {
    const entries = exportEntries(
      [item({ id: 'a', title: 'Coin' })],
      new Map([['a', ['uid/a/x.jpeg']]]),
    );
    expect(entries[0].photos).toEqual([
      {
        storagePath: 'uid/a/x.jpeg',
        archivePath: `${PHOTOS_DIR}/001-coin/1.jpeg`,
      },
    ]);
  });
});

describe('buildManifest', () => {
  const exportedAt = new Date('2026-08-06T10:20:30.000Z');

  it('states its own format and version, so an importer can check them', () => {
    const manifest = buildManifest({
      category: { id: 'c1', name: 'Coins' },
      entries: [],
      exportedAt,
    });
    // Spelled out rather than compared to the constant: this string is
    // what a future importer would key off, so a test that only says "it
    // equals whatever it is" would let it be renamed silently.
    expect(manifest.format).toBe('collectionbuddy-category-export');
    expect(manifest.format).toBe(EXPORT_FORMAT);
    expect(manifest.version).toBe(1);
    expect(manifest.version).toBe(EXPORT_FORMAT_VERSION);
    expect(manifest.exported_at).toBe('2026-08-06T10:20:30.000Z');
    expect(manifest.category).toEqual({ id: 'c1', name: 'Coins' });
    expect(manifest.items).toEqual([]);
  });

  it('keeps every field at full fidelity, unlike the CSV beside it', () => {
    const entries = exportEntries(
      [
        item({
          id: 'a',
          description: 'A note',
          place: 'Cologne',
          place_lat: 50.9,
          place_lng: 6.9,
          tags: ['silver', 'us'],
        }),
      ],
      new Map([['a', ['uid/a/x.webp']]]),
    );
    const [row] = buildManifest({
      category: { id: 'c1', name: 'Coins' },
      entries,
      exportedAt,
    }).items;

    // Numbers stay numbers and tags stay a list -- the two things the CSV
    // has to flatten and this file exists not to.
    expect(row.place_lat).toBe(50.9);
    expect(row.tags).toEqual(['silver', 'us']);
    expect(row.id).toBe('a');
    expect(row.folder).toBe('001-seated-dime');
    expect(row.photos).toEqual([`${PHOTOS_DIR}/001-seated-dime/1.webp`]);
  });

  it('keeps an absent field absent rather than emptying it', () => {
    const entries = exportEntries([item({ id: 'a' })], new Map());
    const [row] = buildManifest({
      category: { id: 'c1', name: 'Coins' },
      entries,
      exportedAt,
    }).items;
    expect(row.description).toBeNull();
    expect(row.place_lat).toBeNull();
  });

  it('survives the round trip through JSON it is written as', () => {
    const manifest = buildManifest({
      category: { id: 'c1', name: 'Münzen' },
      entries: exportEntries([item({ id: 'a' })], new Map()),
      exportedAt,
    });
    expect(JSON.parse(JSON.stringify(manifest))).toEqual(manifest);
  });
});

describe('csvCell', () => {
  it('leaves an ordinary value alone', () => {
    expect(csvCell('Seated Dime')).toBe('Seated Dime');
  });

  it('quotes a value containing the delimiter', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
  });

  it('quotes and doubles an embedded quote', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes a value containing a line break', () => {
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell('a\r\nb')).toBe('"a\r\nb"');
  });

  it('defuses a value a spreadsheet would run as a formula', () => {
    // The app stores what the user typed; handing it to Excel as something
    // to evaluate is the injection this guard exists for.
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+49 221')).toBe("'+49 221");
    expect(csvCell('-5')).toBe("'-5");
    expect(csvCell('@user')).toBe("'@user");
  });

  it('quotes a defused value that also needs quoting', () => {
    expect(csvCell('=HYPERLINK("x","y")')).toBe('"\'=HYPERLINK(""x"",""y"")"');
  });

  it('only defuses a leading formula character', () => {
    expect(csvCell('1+1')).toBe('1+1');
    expect(csvCell('a=b')).toBe('a=b');
  });

  it('leaves an empty cell empty', () => {
    expect(csvCell('')).toBe('');
  });
});

describe('buildCsv', () => {
  it('leads with a byte-order mark, so Excel reads it as UTF-8', () => {
    expect(buildCsv([]).startsWith('﻿')).toBe(true);
  });

  it('writes the header row even with nothing under it', () => {
    expect(buildCsv([])).toBe(`﻿${CSV_COLUMNS.join(',')}\r\n`);
  });

  it('separates rows with CRLF and ends on one', () => {
    const csv = buildCsv(exportEntries([item({ id: 'a' })], new Map()));
    expect(csv.split('\r\n')).toHaveLength(3);
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('writes the columns in the order the header promises', () => {
    const entries = exportEntries(
      [
        item({
          id: 'a',
          title: 'Seated Dime',
          description: 'A note',
          place: 'Cologne',
          place_lat: 50.9,
          place_lng: 6.9,
          tags: ['silver', 'us'],
        }),
      ],
      new Map([['a', ['uid/a/x.webp']]]),
    );
    const [, row] = buildCsv(entries).split('\r\n');
    expect(row).toBe(
      [
        'Seated Dime',
        'A note',
        'Cologne',
        '50.9',
        '6.9',
        '"silver, us"',
        `${PHOTOS_DIR}/001-seated-dime/1.webp`,
        '001-seated-dime',
        '2026-01-02T03:04:05.000Z',
        'a',
      ].join(','),
    );
  });

  it('empties a missing value rather than writing "null"', () => {
    const entries = exportEntries([item({ id: 'a' })], new Map());
    const [, row] = buildCsv(entries).split('\r\n');
    expect(row).not.toContain('null');
    expect(row).toBe(
      'Seated Dime,,,,,,,001-seated-dime,2026-01-02T03:04:05.000Z,a',
    );
  });

  it('keeps a coordinate of zero, which is a place and not a blank', () => {
    const entries = exportEntries(
      [item({ id: 'a', place: 'Null Island', place_lat: 0, place_lng: 0 })],
      new Map(),
    );
    const [, row] = buildCsv(entries).split('\r\n');
    expect(row.split(',').slice(3, 5)).toEqual(['0', '0']);
  });

  // Regression: the formula-injection guard matches a leading `-`, which is
  // also how every negative number starts. Applied to a coordinate cell
  // rather than only to user-authored text, it quoted every southern
  // latitude and western longitude as `'-33.8688` -- text a spreadsheet (or
  // a re-import) can't read back as a number (#413).
  it('writes a southern/western coordinate as a plain number, not a quoted formula guard', () => {
    const entries = exportEntries(
      [
        item({
          id: 'a',
          place: 'Sydney Opera House',
          place_lat: -33.8688,
          place_lng: 151.2093,
        }),
      ],
      new Map(),
    );
    const [, row] = buildCsv(entries).split('\r\n');
    expect(row.split(',').slice(3, 5)).toEqual(['-33.8688', '151.2093']);
  });

  it('separates several photographs with a space, not the delimiter', () => {
    const entries = exportEntries(
      [item({ id: 'a', title: 'Coin' })],
      new Map([['a', ['uid/a/x.webp', 'uid/a/y.webp']]]),
    );
    const [, row] = buildCsv(entries).split('\r\n');
    expect(row).toContain(
      `${PHOTOS_DIR}/001-coin/1.webp ${PHOTOS_DIR}/001-coin/2.webp`,
    );
  });

  it('escapes a title that would otherwise break the row apart', () => {
    const entries = exportEntries(
      [item({ id: 'a', title: 'Half, "Dollar"' })],
      new Map(),
    );
    const [, row] = buildCsv(entries).split('\r\n');
    expect(row.startsWith('"Half, ""Dollar"""')).toBe(true);
  });
});

describe('localDateStamp', () => {
  it('formats the local date, zero-padded', () => {
    expect(localDateStamp(new Date(2026, 7, 6))).toBe('2026-08-06');
    expect(localDateStamp(new Date(2026, 0, 9))).toBe('2026-01-09');
  });

  it('reads the date the exporter is having, not the one in UTC', () => {
    // Late enough in the day that any timezone west of UTC would otherwise
    // stamp this file with yesterday.
    expect(localDateStamp(new Date(2026, 7, 6, 23, 30))).toBe('2026-08-06');
  });
});

describe('archiveName', () => {
  it('names the download after the category and the day', () => {
    expect(archiveName('Coins', new Date(2026, 7, 6))).toBe(
      'CollectionBuddy-coins-2026-08-06.zip',
    );
  });

  it('slugs the category, since this becomes a file name too', () => {
    expect(archiveName('Münzen / Silber', new Date(2026, 7, 6))).toBe(
      'CollectionBuddy-munzen-silber-2026-08-06.zip',
    );
  });

  it('still produces a usable name for a category of only emoji', () => {
    expect(archiveName('🪙', new Date(2026, 7, 6))).toBe(
      'CollectionBuddy-untitled-2026-08-06.zip',
    );
  });
});

// #422: the module doc and both commit messages show every entry inside one
// top-level directory, but the implementation wrote collection.json,
// collection.csv and photos/ straight at the ZIP root -- fine for an
// extractor that auto-wraps (macOS Archive Utility, Windows "Extract All"),
// but CLI `unzip`/7-Zip "extract here" scatter the three entries into
// whatever directory they're run in, and two exports extracted into the
// same place overwrite each other's manifest and spreadsheet.
describe('archiveRootFolder', () => {
  it('names the one directory every entry lives under, the same way the download is named', () => {
    const exportedAt = new Date(2026, 7, 6);
    expect(archiveRootFolder('Coins', exportedAt)).toBe(
      'CollectionBuddy-coins-2026-08-06',
    );
    expect(archiveName('Coins', exportedAt)).toBe(
      `${archiveRootFolder('Coins', exportedAt)}.zip`,
    );
  });

  it('slugs the category the same way the folder inside it does', () => {
    const exportedAt = new Date(2026, 7, 6);
    expect(archiveRootFolder('Münzen / Silber', exportedAt)).toBe(
      'CollectionBuddy-munzen-silber-2026-08-06',
    );
  });
});

describe('the archive’s fixed names', () => {
  it('are what the manifest and spreadsheet are called inside it', () => {
    expect(MANIFEST_NAME).toBe('collection.json');
    expect(CSV_NAME).toBe('collection.csv');
    expect(PHOTOS_DIR).toBe('photos');
  });
});
