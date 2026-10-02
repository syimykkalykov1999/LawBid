import * as Sentry from '@sentry/nestjs';
import type { INestApplicationContext } from '@nestjs/common';
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
    tracesSampleRate: 0,
    beforeSend,
  });
  return true;
}
