import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';

/**
 * Stage 1.1 health endpoints only (docs/01_FOUNDATION_AUTH.md §15, stage 1.1
 * acceptance: `GET /health/ready` = 200). Real indicators (Prisma, Redis)
 * are wired in stage 1.2 once PrismaModule/RedisModule exist — do not add
 * them here, that would be scope creep across stages per .cursorrules.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get('live')
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  ready() {
    return this.health.check([]);
  }
}
