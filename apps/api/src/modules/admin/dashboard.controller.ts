import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../../common/dto/api-docs.decorators';
import {
  ALL_ADMIN_ROLES,
  AdminEndpoint,
} from '../admin-auth/admin-auth.decorators';
import { DashboardDto } from './admin.dto';
import { DashboardService } from './dashboard.service';

/** docs/06 §2.3 item 1 — every admin role (§2.2). */
@ApiTags('admin-dashboard')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@Controller('admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Operational numbers (cached ≤ 60 s)' })
  @ApiEnvelopeResponse(DashboardDto)
  getDashboard(): Promise<DashboardDto> {
    return this.dashboard.get();
  }
}
