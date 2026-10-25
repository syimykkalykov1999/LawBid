import * as Sentry from '@sentry/nestjs';
import { HttpException, type INestApplicationContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ErrorEvent } from '@sentry/nestjs';
import { SecretsService } from '../common/secrets/secrets.service';

/**
 * docs/06 §4.3 — Sentry for the API and the worker. Audit 2026-10-02: the
 * DSN saved in Admin → Integrations wins over the SENTRY_DSN env var (the
 * env value is the fallback), and the worker reports errors too. Read once
 * at start — a change applies after a restart (restartRequired in the
 * provider registry).
 */
/** A 4xx answer is the caller's mistake, not a bug: never an event. */
export function isClientError(hint: { originalException?: unknown }): boolean {
  const e = hint.originalException;
  return e instanceof HttpException && e.getStatus() < 500;
}

/** S12-6: env knobs with safe defaults (errors 100 %, traces off). */
export function sentryRates(env: NodeJS.ProcessEnv = process.env): {
  sampleRate: number;
  tracesSampleRate: number;
} {
  const rate = (raw: string | undefined, fallback: number) => {
    const n = Number(raw);
    return raw !== undefined && Number.isFinite(n)
      ? Math.min(1, Math.max(0, n))
      : fallback;
  };
  return {
    sampleRate: rate(env.SENTRY_SAMPLE_RATE, 1),
    // Billable vendor quota: off unless the owner sets SENTRY_TRACES_SAMPLE_RATE.
    tracesSampleRate: rate(env.SENTRY_TRACES_SAMPLE_RATE, 0),
  };
}

export async function startSentry(
  app: INestApplicationContext,
  config: ConfigService,
  beforeSend: (event: ErrorEvent) => ErrorEvent | null,
): Promise<boolean> {
  const secrets = app.get(SecretsService, { strict: false });
  const saved = await secrets?.field('sentry', 'dsn').catch(() => undefined);
  const dsn = saved || config.get<string>('SENTRY_DSN');
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: config.get<string>('NODE_ENV') ?? 'development',
    // S12-6: the deploy that produced an error (regressions, suspect commits).
    release: process.env.APP_VERSION,
    ...sentryRates(),
    maxBreadcrumbs: 50,
    beforeSend: (event, hint) =>
      isClientError(hint) ? null : beforeSend(event),
  });
  return true;
}
