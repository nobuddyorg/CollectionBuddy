import { describe, expect, it } from 'vitest';

import { afterKeyset, rowsAfterFilter } from './keyset';

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

describe('afterKeyset', () => {
  type Recorder = {
    calls: [string, string[]][];
    gte(column: string, value: string): Recorder;
    or(filters: string): Recorder;
  };
  function recorder(): Recorder {
    const builder: Recorder = {
      calls: [],
      gte(column, value) {
        builder.calls.push(['gte', [column, value]]);
        return builder;
      },
      or(filters) {
        builder.calls.push(['or', [filters]]);
        return builder;
      },
    };
    return builder;
  }

  it('bounds the first column from the key, then drops the rows at or before it', () => {
    const query = recorder();
    const first = { column: 'created_at', value: '2026-01-02T03:04:05+00:00' };
    const second = { column: 'item_id', value: 'b' };

    const bounded = afterKeyset(query, { first, second });

    expect(bounded).toBe(query);
    expect(query.calls).toEqual([
      ['gte', ['created_at', '2026-01-02T03:04:05+00:00']],
      ['or', [rowsAfterFilter(first, second)]],
    ]);
  });
});
