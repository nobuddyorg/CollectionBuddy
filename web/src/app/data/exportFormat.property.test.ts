import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { csvCell } from './exportFormat';

const anyText = fc.oneof(
  fc.string({ unit: 'binary' }),
  fc.string({
    unit: fc.constantFrom(
      '"',
      ',',
      '\r',
      '\n',
      '\t',
      '=',
      '+',
      '-',
      '@',
      "'",
      'a',
    ),
  }),
);

/** One RFC 4180 field back to its value; fails on anything malformed. */
function parseField(field: string): string {
  if (!field.startsWith('"')) {
    expect(field).not.toMatch(/[",\r\n]/);
    return field;
  }
  expect(field.endsWith('"') && field.length >= 2).toBe(true);
  const inner = field.slice(1, -1);
  // Every quote inside comes doubled.
  expect(inner.replace(/""/g, '')).not.toContain('"');
  return inner.replace(/""/g, '"');
}

describe('csvCell, for any text', () => {
  it('reads back as the text itself, or the text behind one apostrophe', () => {
    fc.assert(
      fc.property(anyText, (text) => {
        expect([text, `'${text}`]).toContain(parseField(csvCell(text)));
      }),
    );
  });

  it('never reads back as something a spreadsheet would evaluate', () => {
    fc.assert(
      fc.property(anyText, (text) => {
        expect(parseField(csvCell(text))).not.toMatch(/^[=+\-@\t\r]/);
      }),
    );
  });

  it('adds the apostrophe only where it guards a formula', () => {
    fc.assert(
      fc.property(anyText, (text) => {
        const guarded = parseField(csvCell(text)) !== text;
        expect(guarded).toBe(/^[=+\-@\t\r]/.test(text));
      }),
    );
  });
});
