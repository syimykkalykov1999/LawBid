'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { LazyMotion, MotionConfig } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { SentryInit } from '@/components/sentry-init';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { startActivityTracking } from '@/lib/activity';
import { makeQueryClient } from '@/lib/query-client';
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
  // R-385: data-class defaults (lib/query-client.ts).
  const [client] = useState(() => makeQueryClient(toastSink));
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
