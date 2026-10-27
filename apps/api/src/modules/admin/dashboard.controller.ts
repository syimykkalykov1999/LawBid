import { Controller, Get, Header, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../../common/dto/api-docs.decorators';
import {
  ALL_ADMIN_ROLES,
  AdminEndpoint,
  CurrentAdmin,
  Roles,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAccessReportService } from './admin-access-report.service';
import { DashboardDto } from './admin.dto';
import { DashboardService } from './dashboard.service';

/** docs/06 §2.3 item 1 — every admin role (§2.2). */
@ApiTags('admin-dashboard')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@Controller('admin/dashboard')
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly accessReport: AdminAccessReportService,
  ) {}

  @Get()
  // Owner 2026-10-22 (client economy plan, package J): the browser keeps
  // the heavy aggregate for half a minute per tab.
  @Header('Cache-Control', 'private, max-age=30')
  @ApiOperation({ summary: 'Operational numbers (cached ≤ 60 s)' })
  @ApiEnvelopeResponse(DashboardDto)
  async getDashboard(@CurrentAdmin() admin: AdminActor): Promise<DashboardDto> {
    return this.forAdmin(await this.dashboard.get(), admin);
  }

  /** Owner 2026-10-25: «Обновить» on the user totals, at most once per 10 min. */
  @Post('totals/refresh')
  @Roles('super_admin')
  @ApiOperation({ summary: 'Recount user totals now (max once per 10 min)' })
  @ApiEnvelopeResponse(DashboardDto)
  async refreshTotals(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<DashboardDto> {
    await this.dashboard.refreshTotals();
    // Snapshot rule 2026-10-25: the same button recounts this month's
    // access report (private-content page), with the same cooldown.
    await this.accessReport.refresh();
    return this.forAdmin(await this.dashboard.get(), admin);
  }

  private forAdmin(d: DashboardDto, admin: AdminActor): DashboardDto {
    // Money is closed to everyone but the super admin (owner 2026-10-02).
    if (admin.adminRole === 'super_admin') return d;
    return {
      ...d,
      subscriptions: {
        ...d.subscriptions,
        revenueEstimateCents: null,
        revenueEstimateUsd: null,
      },
    };
  }
}
