import type { MetadataRoute } from 'next';

/**
 * Detective D1-11 (13.11): «Добавить на экран Домой» gets the LawBid mark
 * instead of a screenshot tile (Next.js `manifest.ts` file convention; the
 * icons are app/icon.svg = the sidebar LogoMark and app/apple-icon.png = the
 * app's own 180 px iOS icon). Opens the admin full-screen, no browser bar.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LawBid Admin',
    short_name: 'LawBid Admin',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b0b0d',
    theme_color: '#0a1a3f',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
