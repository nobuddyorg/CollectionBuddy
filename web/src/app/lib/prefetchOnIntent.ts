export function prefetchOnIntent(prefetch: () => void) {
  return {
    onPointerEnter: prefetch,
    onPointerDown: prefetch,
    onFocus: prefetch,
  };
}
