// The feature's only import() sites: Turbopack emits a separate chunk per site, and none of this is in the main bundle.
export const loadBackgroundRemoval = () =>
  import('../../lib/backgroundRemoval');
export const loadCutoutReview = () => import('./CutoutReview');
