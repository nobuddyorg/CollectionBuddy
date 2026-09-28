import { describe, expect, it, vi } from 'vitest';

import { prefetchOnIntent } from './prefetchOnIntent';

describe('prefetchOnIntent', () => {
  it('prefetches on hover, press and keyboard focus alike', () => {
    const prefetch = vi.fn();

    expect(prefetchOnIntent(prefetch)).toStrictEqual({
      onPointerEnter: prefetch,
      onPointerDown: prefetch,
      onFocus: prefetch,
    });
  });
});
