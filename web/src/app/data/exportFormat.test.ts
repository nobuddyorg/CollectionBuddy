import { describe, expect, it } from 'vitest';

import {
  archiveName,
  archiveRootFolder,
  CSV_NAME,
  extensionOf,
  formatExportBytes,
  indexPrefix,
  localDateStamp,
  MANIFEST_NAME,
  PHOTOS_DIR,
  slugify,
} from './exportFormat';

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
    // 'ab ' repeated puts a separator on the 60th character, so the cut leaves one dangling.
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

  // A backslash is a path separator to Windows Explorer's extractor; quotes and trailing dots fail too.
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

describe('formatExportBytes', () => {
  it('renders one decimal place of gigabytes', () => {
    expect(formatExportBytes(1.5 * 1024 ** 3)).toBe('1.5 GB');
  });

  it('rounds rather than truncating', () => {
    expect(formatExportBytes(1.55 * 1024 ** 3)).toBe('1.6 GB');
    expect(formatExportBytes(1.96 * 1024 ** 3)).toBe('2.0 GB');
  });

  it('is zero for no bytes at all', () => {
    expect(formatExportBytes(0)).toBe('0.0 GB');
  });
});

describe('localDateStamp', () => {
  it('formats the local date, zero-padded', () => {
    expect(localDateStamp(new Date(2026, 7, 6))).toBe('2026-08-06');
    expect(localDateStamp(new Date(2026, 0, 9))).toBe('2026-01-09');
  });

  it('reads the date the exporter is having, not the one in UTC', () => {
    // Late enough that a timezone west of UTC would otherwise stamp yesterday.
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
