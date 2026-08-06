import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';
const repo = 'CollectionBuddy';

/**
 * Where a built export expects to be served from -- GitHub Pages puts the
 * site under the repository name, and `next build` bakes that into every
 * asset URL, router link and manifest path.
 *
 * Exported because the end-to-end suite has to serve the export at exactly
 * this path or it is testing a site that has never existed, and a second copy
 * of the string is a second thing to forget.
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
};

export default nextConfig;
