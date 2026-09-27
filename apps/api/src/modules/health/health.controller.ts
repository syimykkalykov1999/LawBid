import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../auth/decorators/public.decorator';
import { SkipVersionCheck } from '../feature-flags/decorators/skip-version-check.decorator';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';

/**
 * `GET /health/live` — process is up (no dependency checks: a DB outage
 * must not make the orchestrator restart every healthy API container).
 * `GET /health/ready` — this instance can serve traffic: CockroachDB
 * answers `SELECT 1` and Redis answers PING, each within
 * HEALTH_CHECK_TIMEOUT_MS; otherwise 503 so the ALB/k8s stops routing to
 * it (docs/06_PRODUCTION.md rolling deploys, docs/01 §13 availability).
 *
 * @Public() (added stage 1.4, docs/CHANGELOG.md): once AuthModule
 * registers JwtAuthGuard as the global APP_GUARD, every route 401s
 * without an explicit opt-out. A load balancer / k8s liveness probe has
 * no bearer token and never will — these routes must stay unauthenticated
 * by design, not by oversight.
 *
 * @SkipVersionCheck() (added stage 1.8, docs/CHANGELOG.md): same
 * reasoning against AppVersionGuard (feature-flags/guards/app-version
 * .guard.ts) — a probe never sends X-App-Version/X-Platform, and
 * AppVersionGuard already skips when those are absent, but marking these
 * routes explicitly keeps the opt-out consistent with every other route
 * in this file rather than relying on that fallback.
 *
 * @SkipThrottle(): probes arrive every few seconds from the same few LB
 * addresses — the global 100/min per-IP ThrottlerGuard would 429 them,
 * and its Redis-backed storage would turn a Redis outage into a 500
 * before `ready` could report a proper 503.
 */
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
  ) {}

  @Public()
  @SkipVersionCheck()
  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  @Public()
  @SkipVersionCheck()
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.database.isHealthy(),
      () => this.redis.isHealthy(),
    ]);
  }
}
