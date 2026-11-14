import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  clampPage,
  PAGE_SIZES,
  pageCount,
  pageHolding,
  pageRange,
} from './paging';

// Pages are asked for from 1 up (Pagination never offers less); any total, any size offered.
const anyPage = fc.integer({ min: 1, max: 100_000 });
const anyTotal = fc.integer({ min: 0, max: 1_000_000 });
const anySize = fc.constantFrom(...PAGE_SIZES);

describe('clampPage and pageRange, for any page, total and size', () => {
  it('shows a page that exists: at least page 1, at most the last', () => {
    fc.assert(
      fc.property(anyPage, anyTotal, anySize, (page, total, size) => {
        const shown = clampPage(page, pageCount(total, size));
        expect(shown).toBeGreaterThanOrEqual(1);
        expect(shown).toBeLessThanOrEqual(Math.max(1, pageCount(total, size)));
      }),
    );
  });

  it('asks for a range holding at least one entry whenever there are any', () => {
    fc.assert(
      fc.property(
        anyPage,
        fc.integer({ min: 1, max: 1_000_000 }),
        anySize,
        (page, total, size) => {
          const { from, to } = pageRange(
            clampPage(page, pageCount(total, size)),
            size,
          );
          expect(from).toBeGreaterThanOrEqual(0);
          expect(from).toBeLessThan(total);
          expect(to).toBeGreaterThanOrEqual(from);
        },
      ),
    );
  });

  it('covers exactly the page size, inclusive at both ends, with no gap to the next page', () => {
    fc.assert(
      fc.property(anyPage, anySize, (page, size) => {
        const { from, to } = pageRange(page, size);
        expect(to - from + 1).toBe(size);
        expect(pageRange(page + 1, size).from).toBe(to + 1);
      }),
    );
  });
});

describe('pageHolding, for any page and any two sizes', () => {
  it('lands on the page whose range holds the entry that was first on screen', () => {
    fc.assert(
      fc.property(anyPage, anySize, anySize, (page, from, to) => {
        const first = pageRange(page, from).from;
        const { from: start, to: end } = pageRange(
          pageHolding(page, { from, to }),
          to,
        );
        expect(first).toBeGreaterThanOrEqual(start);
        expect(first).toBeLessThanOrEqual(end);
      }),
    );
  });
});
