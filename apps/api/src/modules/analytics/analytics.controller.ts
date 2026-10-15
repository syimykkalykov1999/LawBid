import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../../common/dto/api-docs.decorators';
import { AdminEndpoint } from '../admin-auth/admin-auth.decorators';
import { AnalyticsDto, AnalyticsQueryDto } from './analytics.dto';
import { AnalyticsService } from './analytics.service';

/** Owner 2026-10-15: own analytics for the admin (money area: it shows
 * what was bought). */
@ApiTags('admin-analytics')
@AdminEndpoint('super_admin')
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get()
  @ApiOperation({
    summary:
      'DAU/MAU, the sign-up funnel, retention, churn and purchases by day',
  })
  @ApiEnvelopeResponse(AnalyticsDto)
  getAnalytics(@Query() q: AnalyticsQueryDto): Promise<AnalyticsDto> {
    return this.analytics.overview(q.days ?? 30);
  }
}
