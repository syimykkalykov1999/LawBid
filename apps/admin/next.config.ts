import type { NextConfig } from 'next';

// docs/06 §4.1: strict headers for the admin origin. The API token lives
// in an httpOnly cookie (app/api/auth/session) and every API call goes
// through app/api/proxy, so the browser never holds the admin JWT.
// Audit #8 (2026-10-22): the page CSP is per request with a nonce
// (src/middleware.ts + src/lib/csp.ts); /api answers JSON/files only and
// gets a no-script CSP here. HSTS: one year, subdomains, preload.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
];

// No scripts at all; default-src 'self' keeps a proxied PDF viewable.
const apiHeaders = [
  {
    key: 'Content-Security-Policy',
    value: "default-src 'self'; script-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // docs/06 §6.1: the admin runs as its own ECS service from a standalone
  // server bundle (apps/admin/Dockerfile).
  output: 'standalone',
  // «План роста» reads apps/admin/content/*.md at run time; make sure the
  // standalone bundle carries the folder.
  outputFileTracingIncludes: { '/growth-plan': ['./content/**/*'] },
  async headers() {
    return [
      { source: '/(.*)', headers: securityHeaders },
      { source: '/api/:path*', headers: apiHeaders },
    ];
  },
};

export default nextConfig;
