/**
 * S18-4: error boundaries swallow render errors, so each boundary reports
 * the error itself. Goes through the browser Sentry client that
 * components/sentry-init.tsx started (scrubbed in beforeSend); does nothing
 * when Sentry is off. Never throws.
 */
export function reportRenderError(error: Error & { digest?: string }): void {
  void import('@sentry/browser')
    .then((Sentry) => {
      if (Sentry.getClient()) {
        Sentry.captureException(error, { tags: { boundary: 'next-error' } });
      }
    })
    .catch(() => undefined);
}
