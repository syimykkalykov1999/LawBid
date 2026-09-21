import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { Public } from '../auth/decorators/public.decorator';

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
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Public()
  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  @Public()
  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([]);
  }
}
