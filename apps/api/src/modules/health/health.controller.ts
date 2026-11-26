import {
  Controller,
  Get,
  Headers,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { HealthCheckService, type HealthCheckResult } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Public } from '../auth/decorators/public.decorator';
import { SkipVersionCheck } from '../feature-flags/decorators/skip-version-check.decorator';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';

/**
 * `GET /health/live` — process is up (no dependency checks: a DB outage
 * must not make the orchestrator restart every healthy API container).
 * `GET /health/ready` — this instance can serve traffic: PostgreSQL
 * answers `SELECT 1` and Redis answers PING, each within
 * HEALTH_CHECK_TIMEOUT_MS; otherwise 503 so the ALB/k8s stops routing to
 * it (docs/06_PRODUCTION.md rolling deploys, docs/01 §13 availability).
 *
 * Both answers carry `version` (the APP_VERSION of the release this task runs,
 * the image tag; `dev` locally) so the deploy smoke test and the 5-minute
 * synthetic check can prove WHICH release answers (S11-5).
 *
 * ASVS 5.0 V13.4.5 (STAGE2_SECURITY #9): `ready` is public (the load
 * balancer, Route 53, the deploy smoke test have no token), so the public
 * answer is `{ status, version }` only — no list of our dependencies and
 * their state. The detail comes back only with `X-Health-Token:
 * <HEALTH_DETAIL_TOKEN>` (constant-time compare). The DB + Redis probe runs
 * at most once per READY_PROBE_CACHE_MS per process (one probe in flight is
 * shared), so a flood of `/health/ready` cannot multiply database calls.
 * A failed check still answers 503 (the load balancer reads the status code).
 *
 * @Public(): a probe has no bearer token. @SkipVersionCheck(): a probe
 * sends no X-App-Version. @SkipThrottle(): probes arrive every few seconds
 * from the same LB addresses; the per-IP throttler would 429 them.
 */
/** The release this process runs: the image tag set by roll-services.sh. */
const appVersion = (): string => process.env.APP_VERSION || 'dev';

/** How long one DB + Redis probe result is reused. */
export const READY_PROBE_CACHE_MS = 2_000;

const sha = (v: string): Buffer => createHash('sha256').update(v).digest();

/** True when [sent] is HEALTH_DETAIL_TOKEN (both hashed: equal length). */
export function healthDetailAllowed(
  sent: string | undefined,
  token: string | undefined = process.env.HEALTH_DETAIL_TOKEN,
): boolean {
  const t = token?.trim();
  if (!t || t.length < 24 || !sent) return false;
  return timingSafeEqual(sha(sent.trim()), sha(t));
}

type Probe = { at: number; result: HealthCheckResult; ok: boolean };

@ApiTags('health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  private last: Probe | null = null;
  private running: Promise<Probe> | null = null;
  /** Tests move the clock. */
  now: () => number = Date.now;

  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Public()
  @SkipVersionCheck()
  @Get('live')
  live() {
    return { status: 'ok', version: appVersion() };
  }

  @Public()
  @SkipVersionCheck()
  @Get('ready')
  async ready(@Headers('x-health-token') token?: string) {
    const probe = await this.probe();
    if (healthDetailAllowed(token)) {
      if (!probe.ok) {
        throw new ServiceUnavailableException({
          ...probe.result,
          version: appVersion(),
        });
      }
      return { ...probe.result, version: appVersion() };
    }
    if (!probe.ok) {
      throw new ServiceUnavailableException({
        status: 'error',
        version: appVersion(),
      });
    }
    return { status: 'ok', version: appVersion() };
  }

  /** One shared DB + Redis probe, reused for READY_PROBE_CACHE_MS. */
  private probe(): Promise<Probe> {
    const t = this.now();
    if (this.last && t - this.last.at < READY_PROBE_CACHE_MS) {
      return Promise.resolve(this.last);
    }
    if (this.running) return this.running;
    this.running = this.health
      .check([() => this.database.isHealthy(), () => this.redis.isHealthy()])
      .then(
        (result): Probe => ({ at: this.now(), result, ok: true }),
        (err: unknown): Probe => ({
          at: this.now(),
          ok: false,
          result: healthResultOf(err),
        }),
      )
      .then((p) => {
        this.last = p;
        return p;
      })
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }
}

/** Terminus throws a 503 whose body is the HealthCheckResult. */
function healthResultOf(err: unknown): HealthCheckResult {
  const body = (err as { getResponse?: () => unknown }).getResponse?.();
  if (body && typeof body === 'object' && 'status' in body) {
    return body as HealthCheckResult;
  }
  return { status: 'error', info: {}, error: {}, details: {} };
}
