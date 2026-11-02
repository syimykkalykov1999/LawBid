/**
 * «Redis itself is unavailable right now» (not a wrong command): ioredis'
 * command timeout, its retry limit and its closed-connection / refused-
 * while-disconnected errors. The one classifier for every fallback and for
 * AllExceptionsFilter (503 + Retry-After instead of a 500).
 *
 * Load test 2026-11-02 (PR #606, docs/perf/LOAD_RESILIENCE_2026-11-02.md §2).
 */
export function isRedisInfraError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message === 'Command timed out' ||
    error.name === 'MaxRetriesPerRequestError' ||
    error.message.startsWith("Stream isn't writeable") ||
    // Cluster mode: the same refusal worded by ioredis' Cluster class
    error.message.startsWith("Cluster isn't ready") ||
    error.message === 'Connection is closed.'
  );
}
