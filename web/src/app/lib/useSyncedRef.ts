'use client';
import { useEffect, useRef, type RefObject } from 'react';

/** A ref always holding the latest `value`, for a callback that must see it without being recreated. */
export function useSyncedRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
