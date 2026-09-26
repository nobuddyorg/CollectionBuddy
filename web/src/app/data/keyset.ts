/** One column of a two-column sort key, with the value the last row read holds in it. */
export type KeyColumn = { column: string; value: string };

/** PostgREST `or=()` terms for the rows strictly after (first, second), both ascending; quoted, as a timestamp carries `.` and `:`. */
export function rowsAfterFilter(first: KeyColumn, second: KeyColumn): string {
  const firstValue = `"${first.value}"`;
  return `${first.column}.gt.${firstValue},and(${first.column}.eq.${firstValue},${second.column}.gt."${second.value}")`;
}
