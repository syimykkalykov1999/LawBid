import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import * as Sentry from '@sentry/nestjs';
import express from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { AppEnv } from './config/env.schema';
import { buildOpenApiDocument } from './openapi/openapi.config';

export const GLOBAL_PREFIX = 'api/v1';
export const UNPREFIXED_ROUTES = [
  '/health/live',
  '/health/ready',
  '/docs',
  '/docs-json',
];

export interface ConfigureAppOptions {
  /** Overrides ConfigService's NODE_ENV — only the e2e suite uses this, to
   * assert production behavior without having to satisfy production's
   * env validation (real provider keys etc.). */
  nodeEnv?: AppEnv['NODE_ENV'];
}

/** Interactive API docs are a reconnaissance gift in production (every
 * route, DTO and error code at one URL); they stay on everywhere else,
 * including staging, where the mobile team uses them. */
export function shouldExposeApiDocs(nodeEnv: AppEnv['NODE_ENV']): boolean {
  return nodeEnv !== 'production';
}

/**
 * Everything main.ts applies to the Nest app before listen(), in one
 * function so test/security-hardening.e2e-spec.ts exercises the exact
 * production wiring instead of a hand-copied approximation of it.
 */
export function configureApp(
  app: NestExpressApplication,
  options: ConfigureAppOptions = {},
): void {
  const config = app.get(ConfigService);
  const nodeEnv =
    options.nodeEnv ?? config.getOrThrow<AppEnv['NODE_ENV']>('NODE_ENV');
  const exposeDocs = shouldExposeApiDocs(nodeEnv);

  app.useLogger(app.get(Logger));

  // SIGTERM/SIGINT -> app.close(): runs onModuleDestroy/
  // onApplicationShutdown (Prisma $disconnect, Redis quit) so a rolling
  // deploy drains cleanly instead of dropping pooled connections
  // (docs/01 §13 "деплой без простоя").
  app.enableShutdownHooks();

  // Every per-IP limit (ThrottlerGuard, OTP per-IP) keys on req.ip. Behind
  // the AWS ALB (docs/06_PRODUCTION.md) the socket address is the ALB's,
  // so without this every user would share ONE per-IP budget. Set
  // TRUST_PROXY_HOPS=1 in staging/production (exactly one ALB in front);
  // 0 locally. Never higher than the real proxy count, or clients can
  // spoof X-Forwarded-For to dodge per-IP limits.
  app.set('trust proxy', config.getOrThrow<number>('TRUST_PROXY_HOPS'));

  // Security headers (docs/01 §13: OWASP ASVS L2 — V14.4 HTTP security
  // headers). The API only serves JSON, so helmet's defaults are right
  // for it; the one HTML surface is Swagger UI, whose inline bootstrap
  // script the default CSP would block — CSP is therefore relaxed only
  // where docs are served, and docs are never served in production.
  app.use(
    helmet({
      contentSecurityPolicy: exposeDocs ? false : undefined,
      // HSTS only makes sense behind TLS; the ALB terminates TLS in
      // staging/production, and localhost must stay reachable over http.
      strictTransportSecurity:
        nodeEnv === 'production' || nodeEnv === 'staging'
          ? { maxAge: 31_536_000, includeSubDomains: true }
          : false,
    }),
  );

  // docs/06 §4.1 (stage 6.1): CORS only for the admin panel. The mobile
  // app never sends an Origin, so it is unaffected; any other origin gets
  // no CORS headers (the browser refuses the response).
  const adminOrigins = config
    .get<string>('ADMIN_ORIGINS', '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: adminOrigins.length === 0 ? false : adminOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: [
      'Authorization',
      'Content-Type',
      'Idempotency-Key',
      'X-Justification',
      'X-Request-Id',
    ],
    maxAge: 600,
  });

  // docs/06 §4.1: request body cap. `rawBody: true` (main.ts) keeps the
  // Stripe webhook's raw bytes; the cap applies to it as well — Stripe
  // events are a few KB.
  const bodyLimit = `${config.get<number>('BODY_LIMIT_KB', 256)}kb`;
  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ limit: bodyLimit, extended: false }));

  // docs/06 §4.3: Sentry only when a DSN is set; personal data is
  // scrubbed before anything leaves the process.
  const dsn = config.get<string>('SENTRY_DSN');
  if (dsn) {
    Sentry.init({
      dsn,
      environment: nodeEnv,
      tracesSampleRate: 0,
      beforeSend: scrubSentryEvent,
    });
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: UNPREFIXED_ROUTES });

  if (exposeDocs) {
    SwaggerModule.setup('docs', app, buildOpenApiDocument(app));
  }
}

const PII_KEYS = new Set([
  'phone',
  'email',
  'identifier',
  'value',
  'code',
  'authorization',
  'cookie',
  'refreshToken',
  'idToken',
  'nonce',
  'reauthToken',
  'body',
  'body_original',
  'body_display',
  'description',
  'title',
]);

/** Drops request bodies/headers/cookies/user data and any PII-named field
 * from a Sentry event (docs/06 §4.3). Exported for its unit test. */
export function scrubSentryEvent<T extends Sentry.ErrorEvent>(event: T): T {
  if (event.request) {
    delete event.request.data;
    delete event.request.cookies;
    delete event.request.headers;
    if (event.request.url) {
      event.request.url = event.request.url.replace(/\?.*$/, '');
    }
    if (event.request.query_string) delete event.request.query_string;
  }
  if (event.user) event.user = { id: event.user.id };
  const walk = (o: unknown): void => {
    if (!o || typeof o !== 'object') return;
    for (const k of Object.keys(o)) {
      if (PII_KEYS.has(k)) {
        (o as Record<string, unknown>)[k] = '[REDACTED]';
      } else {
        walk((o as Record<string, unknown>)[k]);
      }
    }
  };
  walk(event.extra);
  walk(event.contexts);
  walk(event.breadcrumbs);
  return event;
}
