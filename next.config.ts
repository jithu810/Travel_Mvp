import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return ['/api/:path*', '/auth/:path*', '/login', '/create', '/saved', '/profile', '/profile/edit'].map(source => ({ source, headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }] }));
  },
  // Permit this development machine's LAN origin for dev assets and HMR only.
  allowedDevOrigins: ['192.168.1.4'],
  // Allow the 15 MB file plus multipart overhead through the session proxy.
  experimental: { proxyClientMaxBodySize: '16mb' },
  // Creation integration tests build with a local Supabase fixture. Keep their
  // compiled public settings separate from the real development/production app.
  distDir: process.env.JOURNEY_CREATION_TEST === '1' ? '.next-creation-tests' : '.next',
};

export default nextConfig;
