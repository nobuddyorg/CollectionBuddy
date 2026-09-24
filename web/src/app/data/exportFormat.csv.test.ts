import { describe, expect, it } from 'vitest';

import {
  buildCsv,
  csvCell,
  CSV_COLUMNS,
  exportEntries,
  PHOTOS_DIR,
} from './exportFormat';
import { item } from './exportFormat.test-support';

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

  // The formula guard matches a leading `-`, which is also how every negative number starts.
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
