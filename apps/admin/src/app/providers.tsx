'use client';

import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { LazyMotion, MotionConfig } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { SentryInit } from '@/components/sentry-init';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { startActivityTracking } from '@/lib/activity';
import { makePersister, PERSIST_BUSTER, PERSIST_MAX_AGE_MS, shouldPersistQuery } from '@/lib/persist';
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
  // Speed matrix 2026-11-09 (§3 #4): the cache is also kept in IndexedDB
  // (lib/persist.ts), so a reload or a new tab opens from the stored copy.
  const [persister] = useState(() => makePersister());
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        <LazyMotion features={loadMotionFeatures}>
          <PersistQueryClientProvider
            client={client}
            persistOptions={{
              persister,
              maxAge: PERSIST_MAX_AGE_MS,
              buster: PERSIST_BUSTER,
              dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
            }}
          >
            <ToastProvider>
              <ToastBridge sink={toastSink} />
              {children}
            </ToastProvider>
            <SentryInit dsn={sentryDsn} />
          </PersistQueryClientProvider>
        </LazyMotion>
      </MotionConfig>
    </ThemeProvider>
  );
}
