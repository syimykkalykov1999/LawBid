import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import '@fontsource-variable/inter';
import '@fontsource-variable/source-serif-4';
import './globals.css';
import { sentryDsn } from '@/lib/sentry-dsn';
import { THEME_INIT_SCRIPT } from '@/lib/theme';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: { default: 'LawBid Admin', template: '%s · LawBid Admin' },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f5f1' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0d' },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Audit #8: the per-request CSP nonce from middleware.ts. Reading it also
  // makes every page dynamic, so each response carries its own nonce.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const dsn = await sentryDsn();
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        <Providers sentryDsn={dsn}>{children}</Providers>
      </body>
    </html>
  );
}
