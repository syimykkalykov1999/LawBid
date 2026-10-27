'use client';

import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LazyMotion, MotionConfig } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { SentryInit } from '@/components/sentry-init';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { ApiError } from '@/lib/api/client';
import { startActivityTracking } from '@/lib/activity';
import { queryRetryDelay, shouldRetryQuery } from '@/lib/query-retry';
import { ThemeProvider } from '@/lib/theme';

// S18-8: the animation engine loads after first paint, in its own chunk.
const loadMotionFeatures = () => import('@/lib/motion-features').then((m) => m.default);

type ToastError = (e: unknown) => void;

/** Hands the toast to the QueryClient's MutationCache (S18-11). */
function ToastBridge({ sink }: { sink: { current: ToastError | null } }) {
  const toast = useToast();
  useEffect(() => {
    sink.current = toast.error;
    return () => {
      sink.current = null;
    };
  }, [sink, toast.error]);
  return null;
}

export function Providers({
  children,
  sentryDsn = null,
}: {
  children: React.ReactNode;
  sentryDsn?: string | null;
}) {
  const toastSink = useRef<ToastError | null>(null);
  useEffect(() => {
    startActivityTracking();
  }, []);
  const [client] = useState(
    () =>
      new QueryClient({
        // S18-11: a mutation that has no onError of its own must still tell
        // the admin it failed (a money / ban button must never just un-spin).
        // A 401 is already handled by the redirect to /login.
        mutationCache: new MutationCache({
          onError: (error, _vars, _ctx, mutation) => {
            if (mutation.options.onError) return;
            if (error instanceof ApiError && error.status === 401) return;
            toastSink.current?.(error);
          },
        }),
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
        <LazyMotion features={loadMotionFeatures}>
          <QueryClientProvider client={client}>
            <ToastProvider>
              <ToastBridge sink={toastSink} />
              {children}
            </ToastProvider>
            <SentryInit dsn={sentryDsn} />
          </QueryClientProvider>
        </LazyMotion>
      </MotionConfig>
    </ThemeProvider>
  );
}
