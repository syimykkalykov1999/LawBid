import * as Sentry from '@sentry/nestjs';
import { HttpException, type INestApplicationContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ErrorEvent } from '@sentry/nestjs';
import { SecretsService } from '../common/secrets/secrets.service';
import { throttledBeforeSend } from './sentry-throttle';

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

/**
 * Sentry 11 removed `sendDefaultPii`; an unset `dataCollection` now sends
 * cookies, request/response bodies, headers, the user, SQL query data,
 * GenAI inputs/outputs and queue payloads. This is the v10 restrictive
 * baseline, copied from the SDK's MIGRATION.md («If you want to keep the
 * v10 default behavior», getsentry/sentry-javascript, MIT). Kept on top of
 * scrubSentryEvent, which only sees error events, not spans.
 */
const HEADER_DENY = ['forwarded', '-ip', 'remote-', 'via', '-user'];
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: {
    request: { deny: HEADER_DENY },
    response: { deny: HEADER_DENY },
  },
  httpBodies: [],
  urlQueryParams: { deny: HEADER_DENY },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  graphQL: { document: false, variables: false },
} satisfies NonNullable<Parameters<typeof Sentry.init>[0]>['dataCollection'];

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
  const throttled = throttledBeforeSend(beforeSend);
  Sentry.init({
    dsn,
    environment: config.get<string>('NODE_ENV') ?? 'development',
    // S12-6: the deploy that produced an error (regressions, suspect commits).
    release: process.env.APP_VERSION,
    ...sentryRates(),
    maxBreadcrumbs: 50,
    dataCollection: SENTRY_DATA_COLLECTION,
    // v11 turned this on by default; v10 sent captureMessage (journal chain,
    // contacts-sync alarms) without a synthetic stack, grouped as before.
    attachStacktrace: false,
    // Cost registry V9: a crash loop cannot eat the monthly quota in an hour.
    beforeSend: (event, hint) =>
      isClientError(hint) ? null : throttled(event),
  });
  return true;
}
