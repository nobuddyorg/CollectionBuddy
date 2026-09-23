import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';
const repository = 'CollectionBuddy';

/** GitHub Pages serves the site under the repository name, and `next build` bakes that into every asset URL. */
export const EXPORT_BASE_PATH = `/${repository}`;

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  // `next dev` serves from the root; the base path applies only to the deployed build.
  basePath: isProduction ? EXPORT_BASE_PATH : '',
  env: { NEXT_PUBLIC_BASE_PATH: isProduction ? EXPORT_BASE_PATH : '' },
  // Set only by the builds that feed e2e/coverage.ts; the deployed build must not ship source maps.
  productionBrowserSourceMaps: process.env.E2E_COVERAGE_SOURCEMAPS === 'true',
};

export default nextConfig;
