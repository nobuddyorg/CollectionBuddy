'use client';
import { useEffect, useRef, type RefObject } from 'react';

/** A ref that always holds the latest `value`, for reading inside a
 * callback (an event handler, an imperative command) that must see the
 * current value without itself being recreated whenever `value` changes. */
export function useSyncedRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
