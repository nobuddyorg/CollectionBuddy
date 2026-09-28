// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { loadCoinCutout, loadCutoutReview } from './load';

describe('coin cut-out chunks', () => {
  it('load the cut-out itself and its review on demand', async () => {
    const [coinCutout, review] = await Promise.all([
      loadCoinCutout(),
      loadCutoutReview(),
    ]);

    expect(coinCutout.cutOutCoin).toBeTypeOf('function');
    expect(coinCutout.preloadCoinModel).toBeTypeOf('function');
    expect(review.default).toBeTypeOf('function');
  });
});
