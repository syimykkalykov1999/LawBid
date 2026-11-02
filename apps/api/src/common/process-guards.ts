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
