/** One column of a two-column sort key, with the value the last row read holds in it. */
export type KeyColumn = { column: string; value: string };

/** PostgREST `or=()` terms for the rows strictly after (first, second), both ascending; quoted, as a timestamp carries `.` and `:`. */
export function rowsAfterFilter(first: KeyColumn, second: KeyColumn): string {
  const firstValue = `"${first.value}"`;
  return `${first.column}.gt.${firstValue},and(${first.column}.eq.${firstValue},${second.column}.gt."${second.value}")`;
}

// The gte lets the index scan start at the key; the or=() drops the ties already read.
export function afterKeyset<
  Q extends { gte(column: string, value: string): Q; or(filters: string): Q },
>(query: Q, { first, second }: { first: KeyColumn; second: KeyColumn }): Q {
  return query
    .gte(first.column, first.value)
    .or(rowsAfterFilter(first, second));
}
