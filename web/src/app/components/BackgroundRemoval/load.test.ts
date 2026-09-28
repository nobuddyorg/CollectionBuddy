// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';

import { loadBackgroundRemoval, loadCutoutReview } from './load';

describe('background removal chunks', () => {
  it('load the cut-out itself and its review on demand', async () => {
    const [backgroundRemoval, review] = await Promise.all([
      loadBackgroundRemoval(),
      loadCutoutReview(),
    ]);

    expect(backgroundRemoval.removeBackground).toBeTypeOf('function');
    expect(backgroundRemoval.preloadSegmentationModel).toBeTypeOf('function');
    expect(review.default).toBeTypeOf('function');
  });
});
