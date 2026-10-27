/**
 * 2026-10-25 (S14-1 / S14-2): a public answer must be the same for a known
 * and an unknown account, in content AND in time (OWASP Forgot Password
 * Cheat Sheet). A known number pays for a real SMS round trip; an unknown
 * (or registered-and-skipped) one waits as long as real sends have lately
 * taken, so honest users are never slowed and the two cannot be told apart
 * by a stopwatch.
 */
let averageSendMs: number | null = null;

/** Feeds the running average of how long a real code send takes. */
export function recordSendDuration(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  averageSendMs = averageSendMs === null ? ms : averageSendMs * 0.8 + ms * 0.2;
}

/** Waits roughly as long as a real send (±20 %); [fallbackMs] is the guess
 * until the first real send was timed (AUTH_UNIFORM_MIN_DELAY_MS). */
export async function simulateSend(fallbackMs: number): Promise<void> {
  const base = Math.min(5_000, Math.max(0, averageSendMs ?? fallbackMs));
  const wait = Math.round(base * (0.8 + Math.random() * 0.4));
  if (wait <= 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, wait));
}

/** Runs a real send and times it for [simulateSend]. */
export async function timedSend<T>(work: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await work();
  } finally {
    recordSendDuration(Date.now() - started);
  }
}

/** Test hook. */
export function resetSendLatency(): void {
  averageSendMs = null;
}
