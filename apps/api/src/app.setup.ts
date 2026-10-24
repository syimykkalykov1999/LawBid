import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
import * as Sentry from '@sentry/nestjs';
import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppSettingsService } from './common/app-settings/app-settings.service';
import { CorsPolicy } from './common/cors/cors-policy';
import type { AppEnv } from './config/env.schema';
import { buildOpenApiDocument } from './openapi/openapi.config';

export const GLOBAL_PREFIX = 'api/v1';
/** POST /contacts/sync: the whole phone book in one body (configureApp). */
export const CONTACTS_SYNC_PATH = `/${GLOBAL_PREFIX}/contacts/sync`;
export const CONTACTS_BODY_LIMIT = '1mb';
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
 * Owner 2026-10-15: gzip/brotli for answers over 1 KB (JSON shrinks 3-6x).
 * Skipped for a client that sends `X-No-Compression` and for event streams.
 */
export function responseCompression() {
  return compression({
    threshold: 1024,
    filter: (req, res) =>
      req.headers['x-no-compression'] === undefined &&
      !String(res.getHeader('Content-Type') ?? '').startsWith(
        'text/event-stream',
      ) &&
      compression.filter(req, res),
  });
}

/**
 * Everything main.ts applies to the Nest app before listen(), in one
 * function so test/security-hardening.e2e-spec.ts exercises the exact
 * production wiring instead of a hand-copied approximation of it.
 */
import { startSentry } from './telemetry/sentry';

/**
 * docs/06 §4.1 body cap. Owner 2026-10-22: the whole phone book goes up in
 * one request (up to CONTACT_HASHES_MAX hashes, ~67 bytes each), so
 * POST /contacts/sync is parsed first with its own, bigger cap; the general
 * parser then leaves that body alone.
 */
export function useBodyParsers(
  app: Pick<NestExpressApplication, 'use'>,
  bodyLimit: string,
): void {
  // Owner 2026-10-22: LiveKit posts its webhooks as
  // `application/webhook+json`, which no default parser reads; the signature
  // covers the exact bytes, so keep them (req.rawBody) like Stripe's.
  app.use(
    `/${GLOBAL_PREFIX}/webhooks/livekit`,
    express.json({
      type: 'application/webhook+json',
      limit: bodyLimit,
      verify: (req, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );
  app.use(CONTACTS_SYNC_PATH, express.json({ limit: CONTACTS_BODY_LIMIT }));
  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ limit: bodyLimit, extended: false }));
}

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

  // Owner 2026-10-15: every JSON answer carries an ETag, so the phone asks
  // "has it changed?" and gets an empty 304 instead of the whole answer.
  // HTTP_ETAG=false stops tagging (the phone then simply downloads again).
  if (!config.get<boolean>('HTTP_ETAG', true)) app.set('etag', false);

  // Owner 2026-10-15: smaller answers (JSON 5–10x), the single biggest
  // saving on a phone's network and on traffic cost; flag HTTP_COMPRESSION.
  if (config.get<boolean>('HTTP_COMPRESSION', true)) {
    app.use(responseCompression());
  }

  // docs/06 §4.1 (stage 6.1): CORS for the admin panel (`ADMIN_ORIGINS`)
  // and the client web app (`web.allowed_origins` in app_config), both with
  // credentials (owner 2026-10-22: the website's refresh-token cookie) —
  // see CorsPolicy. The mobile app never
  // sends an Origin, so it is unaffected; any other origin gets no CORS
  // headers (the browser refuses the response).
  const adminOrigins = config
    .get<string>('ADMIN_ORIGINS', '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const settings = app.get(AppSettingsService, { strict: false });
  const cors = new CorsPolicy(adminOrigins, nodeEnv, () =>
    settings.stringList('web.allowed_origins'),
  );
  app.enableCors(
    cors.delegate({
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'Accept-Language',
        'Idempotency-Key',
        'X-Justification',
        'X-Request-Id',
        'X-Device-Id',
        'X-Platform',
        'X-App-Version',
        // Sent by the app on every request too; a browser build (the web
        // preview, the future web client) needs them allowed or the
        // preflight fails. docs/ops/demo-world.md for the demo marker.
        'X-Device-Key',
        'X-LawBid-Demo',
        'X-Reauth-Token',
        // Owner 2026-10-22: the website's refresh-token cookie mode.
        'X-LawBid-Web-Session',
        // Owner 2026-10-23 (web pass): the app's own HTTP cache revalidates
        // with If-None-Match (a 304 instead of the whole answer) ...
        'If-None-Match',
      ],
      // ... and reads the tag from `ETag`, which a cross-origin page may
      // not see unless it is exposed.
      exposedHeaders: ['ETag'],
      maxAge: 600,
    }),
  );

  // docs/06 §4.1: request body cap. `rawBody: true` (main.ts) keeps the
  // Stripe webhook's raw bytes; the cap applies to it as well — Stripe
  // events are a few KB.
  useBodyParsers(app, `${config.get<number>('BODY_LIMIT_KB', 256)}kb`);

  // docs/06 §4.3: Sentry only when a DSN is set (Admin → Integrations
  // first, then SENTRY_DSN); personal data is scrubbed before anything
  // leaves the process.
  void startSentry(app, config, scrubSentryEvent).catch(() => undefined);

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
