import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';
const repo = 'CollectionBuddy';

const nextConfig: NextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: isProd ? `/${repo}` : '',
  env: { NEXT_PUBLIC_BASE_PATH: isProd ? `/${repo}` : '' },
};

export default nextConfig;
