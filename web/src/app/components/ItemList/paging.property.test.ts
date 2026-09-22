import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { clampPage, PAGE_SIZE, pageCount, pageRange } from './paging';

// Pages are asked for from 1 up (Pagination never offers less); any total.
const anyPage = fc.integer({ min: 1, max: 100_000 });
const anyTotal = fc.integer({ min: 0, max: 1_000_000 });

describe('clampPage and pageRange, for any page and total', () => {
  it('shows a page that exists: at least page 1, at most the last', () => {
    fc.assert(
      fc.property(anyPage, anyTotal, (page, total) => {
        const shown = clampPage(page, pageCount(total));
        expect(shown).toBeGreaterThanOrEqual(1);
        expect(shown).toBeLessThanOrEqual(Math.max(1, pageCount(total)));
      }),
    );
  });

  it('asks for a range holding at least one entry whenever there are any', () => {
    fc.assert(
      fc.property(
        anyPage,
        fc.integer({ min: 1, max: 1_000_000 }),
        (page, total) => {
          const { from, to } = pageRange(clampPage(page, pageCount(total)));
          expect(from).toBeGreaterThanOrEqual(0);
          expect(from).toBeLessThan(total);
          expect(to).toBeGreaterThanOrEqual(from);
        },
      ),
    );
  });

  it('covers exactly PAGE_SIZE rows, inclusive at both ends, with no gap to the next page', () => {
    fc.assert(
      fc.property(anyPage, (page) => {
        const { from, to } = pageRange(page);
        expect(to - from + 1).toBe(PAGE_SIZE);
        expect(pageRange(page + 1).from).toBe(to + 1);
      }),
    );
  });
});
