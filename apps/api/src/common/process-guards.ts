/**
 * B-12 (audit 2026-11-01): a forgotten `void promise` that rejects used to
 * kill the whole process on Node >= 15 — every socket of the task dropped at
 * once and reconnected onto its neighbours. Log it loudly (picked up by
 * Sentry and CloudWatch alerts) and keep serving. Genuine uncaught
 * exceptions still end the process: state is unknown there.
 */
export function installProcessGuards(): void {
  process.on('unhandledRejection', (reason) => {
    logFatal(50, 'unhandled_rejection', 'unhandledRejection', reason);
  });
}

// scheme://user:pass@host -> scheme://***@host (DB / Redis URLs in client errors)
const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi;

function describe(reason: unknown): unknown {
  if (!(reason instanceof Error)) return String(reason);
  const e = reason as Error & {
    code?: unknown;
    cause?: unknown;
    errors?: unknown[];
  };
  return {
    message: e.message.replace(URL_CREDENTIALS, '$1***@'),
    // Node 20+ dual-stack ECONNREFUSED is an AggregateError with an empty message.
    code: e.code,
    errors: Array.isArray(e.errors) ? e.errors.map(describe) : undefined,
    cause: e.cause === undefined ? undefined : describe(e.cause),
    stack: e.stack?.replace(URL_CREDENTIALS, '$1***@'),
  };
}

function logFatal(
  level: number,
  alert: string,
  msg: string,
  reason: unknown,
): void {
  console.error(JSON.stringify({ level, alert, msg, err: describe(reason) }));
}

/**
 * Entry-point runner (audit 2026-11-02). A rejected `bootstrap()` (invalid env,
 * no database or Redis, a failed KMS unwrap) used to land in the
 * unhandledRejection guard above, which only logs: the half-started process can
 * stay alive on open handles (OTel, ioredis) and the failure shows up late as a
 * failed ALB health check. A start-up failure must end the process with a
 * readable line and exit code 1, so ECS stops the task and rolls the deploy back.
 */
export function runEntrypoint(
  name: string,
  main: () => Promise<void>,
  exit: (code: number) => void = (code) => process.exit(code),
): Promise<void> {
  return Promise.resolve()
    .then(main)
    .catch((reason: unknown) => {
      logFatal(60, 'startup_failed', `${name} failed to start`, reason);
      exit(1);
    });
}
