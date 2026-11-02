/**
 * B-12 (audit 2026-11-01): a forgotten `void promise` that rejects used to
 * kill the whole process on Node >= 15 — every socket of the task dropped at
 * once and reconnected onto its neighbours. Log it loudly (picked up by
 * Sentry and CloudWatch alerts) and keep serving. Genuine uncaught
 * exceptions still end the process: state is unknown there.
 */
export function installProcessGuards(): void {
  process.on('unhandledRejection', (reason) => {
    console.error(
      JSON.stringify({
        level: 50,
        alert: 'unhandled_rejection',
        msg: 'unhandledRejection',
        err:
          reason instanceof Error
            ? { message: reason.message, stack: reason.stack }
            : String(reason),
      }),
    );
  });
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
  return main().catch((reason: unknown) => {
    console.error(
      JSON.stringify({
        level: 60,
        alert: 'startup_failed',
        msg: `${name} failed to start`,
        err:
          reason instanceof Error
            ? { message: reason.message, stack: reason.stack }
            : String(reason),
      }),
    );
    exit(1);
  });
}
