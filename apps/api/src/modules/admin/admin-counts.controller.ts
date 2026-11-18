import { Controller, Get, Header, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ApiEnvelopeResponse } from '../../common/dto/api-docs.decorators';
import { notModified } from '../../common/sync/cheap-etag';
import {
  ALL_ADMIN_ROLES,
  type AdminActor,
  AdminEndpoint,
  CurrentAdmin,
} from '../admin-auth/admin-auth.decorators';
import { canAccess } from '../admin-auth/admin-permissions';
import { AdminCountsDto } from './admin.dto';
import { AdminCountsService } from './admin-counts.service';

/** Owner 2026-10-22 (client economy plan, package J): the sidebar badges
 * in one request — every admin role (each badge is shown only where the
 * role may open the section). R-403: counted in the admin's country scope,
 * like the lists. */
@ApiTags('admin-dashboard')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@Controller('admin/counts')
export class AdminCountsController {
  constructor(private readonly counts: AdminCountsService) {}

  @Get()
  @Header('Cache-Control', 'private, max-age=30')
  @ApiOperation({
    summary:
      'Sidebar badges: verification queue, open reports, support unread, trust queue (ETag → 304)',
  })
  @ApiEnvelopeResponse(AdminCountsDto)
  async getCounts(
    @CurrentAdmin() admin: AdminActor,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AdminCountsDto | undefined> {
    const counts = onlyOpenSections(
      admin,
      await this.counts.get(admin.countries),
    );
    if (notModified(req, res, this.counts.etagOf(counts))) return undefined;
    return counts;
  }
}

/** Verify batch 11 (B3): a badge of a section the admin cannot open is 0
 * (the same access decision as the section's own list). */
function onlyOpenSections(
  admin: AdminActor,
  c: AdminCountsDto,
): AdminCountsDto {
  const open = (section: string) =>
    canAccess(
      admin.adminRole,
      admin.permissions ?? {},
      `/admin/${section}`,
      'GET',
      admin.manageAdmins ?? false,
      admin.partner ?? null,
      admin.noPii ?? false,
      admin.workspaceHead ?? false,
    );
  const verification = open('verification');
  return {
    verificationQueue: verification ? c.verificationQueue : 0,
    openReports: open('moderation') ? c.openReports : 0,
    supportUnread: open('support') ? c.supportUnread : 0,
    trustQueue: verification ? c.trustQueue : 0,
  };
}
