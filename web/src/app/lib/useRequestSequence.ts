'use client';
import { useCallback, useRef } from 'react';

/** A request stamped with next() applies its result only while isCurrent() agrees; a stale one is dropped. */
export function useRequestSequence() {
  const sequence = useRef(0);
  const next = useCallback(() => ++sequence.current, []);
  const isCurrent = useCallback(
    (stamp: number) => stamp === sequence.current,
    [],
  );
  return { next, isCurrent };
}
