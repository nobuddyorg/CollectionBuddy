import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';
const repo = 'CollectionBuddy';

/**
 * Where a built export expects to be served from -- GitHub Pages puts the
 * site under the repository name, and `next build` bakes that into every
 * asset URL. Exported so the e2e suite serves the export at the same path.
 */
export const EXPORT_BASE_PATH = `/${repo}`;

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  // `next dev` serves from the root, so the base path only applies to the
  // build that is actually deployed.
  basePath: isProd ? EXPORT_BASE_PATH : '',
  env: { NEXT_PUBLIC_BASE_PATH: isProd ? EXPORT_BASE_PATH : '' },
  // Off by default: this static export ships whatever `next build` produces
  // as-is, so turning this on unconditionally would publish source maps in
  // the production build too. Set only by the builds that feed the e2e
  // suite's coverage report (e2e/coverage.ts), which wants line-accurate
  // source, not pages-deploy.yml's build of the site that actually deploys.
  productionBrowserSourceMaps: process.env.E2E_COVERAGE_SOURCEMAPS === 'true',
};

export default nextConfig;
