/** Whole percent downloaded, at most 100; 0 while the size is unknown (a compressed response). */
export function downloadPercent({
  loaded,
  total,
}: {
  loaded: number;
  total: number;
}): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((loaded / total) * 100));
}
