/** Rejects if `work` hasn't settled within `ms`. A readiness probe must
 * answer quickly even when a dependency hangs (ioredis queues commands
 * while reconnecting; a stalled TCP connection to the DB never errors on
 * its own) — a probe that hangs is as bad as one that lies. */
export async function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const HEALTH_CHECK_TIMEOUT_MS = 1500;
