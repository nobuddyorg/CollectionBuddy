import { randomUUID } from 'node:crypto';

import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';
const repository = 'CollectionBuddy';

// The deploy passes the Pages site's URL, which has no path on a custom domain; other builds mimic the project URL.
const pagesUrl = process.env.PAGES_BASE_URL;

/** Where the export is served, which `next build` bakes into every asset URL. */
export const EXPORT_BASE_PATH =
  pagesUrl === undefined
    ? `/${repository}`
    : new URL(pagesUrl).pathname.replace(/\/$/, '');

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  // `next dev` serves from the root; the base path applies only to the deployed build.
  basePath: isProduction ? EXPORT_BASE_PATH : '',
  env: {
    NEXT_PUBLIC_BASE_PATH: isProduction ? EXPORT_BASE_PATH : '',
    // Versions the service worker's cache: a new build, a new cache, and the old builds' caches deleted.
    NEXT_PUBLIC_BUILD_ID: randomUUID(),
  },
  // Set only by the builds that feed e2e/coverage.ts; the deployed build must not ship source maps.
  productionBrowserSourceMaps: process.env.E2E_COVERAGE_SOURCEMAPS === 'true',
};

export default nextConfig;
