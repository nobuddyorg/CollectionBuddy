/** The UUID right after `id` in Postgres's byte order, so a row given it sorts exactly where `id`'s row did. */
export function idAfter(id: string): string {
  const next = (BigInt(`0x${id.replace(/-/g, '')}`) + BigInt(1))
    .toString(16)
    .padStart(32, '0');
  return [
    next.slice(0, 8),
    next.slice(8, 12),
    next.slice(12, 16),
    next.slice(16, 20),
    next.slice(20),
  ].join('-');
}
