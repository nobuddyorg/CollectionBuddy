'use client';
import { useEffect, useState } from 'react';

/** Mirrors `value`, delayed by `delayMs` behind the latest change -- each
 * new value restarts the wait, so only a value the caller has stopped
 * changing for a full `delayMs` is ever committed. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
