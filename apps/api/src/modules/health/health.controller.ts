import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator';
import { SkipVersionCheck } from '../feature-flags/decorators/skip-version-check.decorator';

/**
 * Stage 1.1 health endpoints only (docs/01_FOUNDATION_AUTH.md §15, stage 1.1
 * acceptance: `GET /health/ready` = 200). Real indicators (Prisma, Redis)
 * are wired in stage 1.2 once PrismaModule/RedisModule exist — do not add
 * them here, that would be scope creep across stages per .cursorrules.
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
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

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
    return this.health.check([]);
  }
}
