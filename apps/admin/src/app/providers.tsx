'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { useState } from 'react';
import { SentryInit } from '@/components/sentry-init';
import { ToastProvider } from '@/components/ui/toast';
import { queryRetryDelay, shouldRetryQuery } from '@/lib/query-retry';
import { ThemeProvider } from '@/lib/theme';

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Backoff with jitter, never a 4xx (lib/query-retry.ts). A failed
            // request does not flip the UI to "offline": the query keeps its
            // previous data and tries again.
            retry: shouldRetryQuery,
            retryDelay: (attempt) => queryRetryDelay(attempt),
            networkMode: 'offlineFirst',
          },
        },
      }),
  );
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        <QueryClientProvider client={client}>
          <ToastProvider>{children}</ToastProvider>
          <SentryInit />
        </QueryClientProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
