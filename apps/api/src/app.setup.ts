import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';
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
