import { vi } from 'vitest';

/** Makes `(pointer: coarse)` answer `matches`; the returned function flips it and notifies subscribers. */
export function stubCoarsePointer(matches: boolean) {
  let current = matches;
  const listeners = new Set<() => void>();
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        get matches() {
          return query === '(pointer: coarse)' && current;
        },
        media: query,
        addEventListener: (_type: string, listener: () => void) =>
          listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) =>
          listeners.delete(listener),
      }) as unknown as MediaQueryList,
  );
  return (next: boolean) => {
    current = next;
    listeners.forEach((listener) => listener());
  };
}
