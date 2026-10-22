import { Controller, Get, Header, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ApiEnvelopeResponse } from '../../common/dto/api-docs.decorators';
import { notModified } from '../../common/sync/cheap-etag';
import {
  ALL_ADMIN_ROLES,
  AdminEndpoint,
  CurrentAdmin,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminCountsDto } from './admin.dto';
import { AdminCountsService } from './admin-counts.service';

/** Owner 2026-10-22 (client economy plan, package J): the sidebar badges
 * in one request — every admin role (each badge is shown only where the
 * role may open the section). */
@ApiTags('admin-dashboard')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@Controller('admin/counts')
export class AdminCountsController {
  constructor(private readonly counts: AdminCountsService) {}

  @Get()
  @Header('Cache-Control', 'private, max-age=30')
  @ApiOperation({
    summary:
      'Sidebar badges: verification queue, open reports, support unread, trust queue, approvals (ETag → 304)',
  })
  @ApiEnvelopeResponse(AdminCountsDto)
  async getCounts(
    @CurrentAdmin() admin: AdminActor,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminCountsDto | undefined> {
    const counts = await this.counts.get(admin);
    if (notModified(req, res, this.counts.etagOf(counts))) return undefined;
    return counts;
  }
}
