'use client';
import { useCallback, useRef } from 'react';

/**
 * Guards against a slower, older async response landing after a newer one
 * has already resolved. A caller stamps its request with `next()`'s return
 * value and only applies the result once `isCurrent()` still agrees -- a
 * request superseded by a later one is simply dropped, not raced against it.
 *
 * `next`/`isCurrent` are stable across renders (useCallback, no
 * dependencies) so including them in another callback's dependency array
 * doesn't defeat that callback's own memoization. A mutant that fills those
 * empty dependency lists with a constant is equivalent, since React sees the
 * same contents on every render either way.
 */
export function useRequestSequence() {
  const seq = useRef(0);
  // Stryker disable next-line ArrayDeclaration: see above
  const next = useCallback(() => ++seq.current, []);
  // Stryker disable next-line ArrayDeclaration: see above
  const isCurrent = useCallback((mySeq: number) => mySeq === seq.current, []);
  return { next, isCurrent };
}
