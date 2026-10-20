import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Type-checking runs via `npm run typecheck`; ESLint isn't configured here.
  eslint: { ignoreDuringBuilds: true },
  // Node-only packages that must not be bundled (they use `node:` built-ins);
  // Next requires them at runtime instead.
  serverExternalPackages: ['nodemailer', 'mongoose']
};

export default nextConfig;
