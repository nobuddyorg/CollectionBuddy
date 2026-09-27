import { describe, expect, it } from 'vitest';

import { rowsAfterFilter } from './keyset';

describe('rowsAfterFilter', () => {
  it('matches a later first value, or the same one with a later second value, both quoted', () => {
    expect(
      rowsAfterFilter(
        { column: 'created_at', value: '2026-01-02T03:04:05.1+00:00' },
        { column: 'id', value: 'b' },
      ),
    ).toBe(
      'created_at.gt."2026-01-02T03:04:05.1+00:00",and(created_at.eq."2026-01-02T03:04:05.1+00:00",id.gt."b")',
    );
  });
});
