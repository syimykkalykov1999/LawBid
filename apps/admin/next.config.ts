import type { NextConfig } from 'next';

// docs/06 §4.1: strict headers for the admin origin. The API token lives
// in an httpOnly cookie (app/api/auth/session) and every API call goes
// through app/api/proxy, so the browser never holds the admin JWT.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // `next dev` needs eval for react-refresh; production stays strict.
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"}`,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      // Reels play from signed Bunny/S3 links and sticker files upload
      // straight to the media bucket (admin/media).
      "media-src 'self' https: blob:",
      `connect-src 'self' https:${process.env.NODE_ENV === 'production' ? '' : ' http://localhost:9000'}`,
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // docs/06 §6.1: the admin runs as its own ECS service from a standalone
  // server bundle (apps/admin/Dockerfile).
  output: 'standalone',
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
