/** `2026-08-06`, the date in the browser's own timezone rather than UTC's. */
export function localDateStamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// End of day, not midnight: midnight would trip category_shares_expiry_in_future for most of the day.
export function endOfLocalDayIso(dateStamp: string): string {
  return new Date(`${dateStamp}T23:59:59`).toISOString();
}
