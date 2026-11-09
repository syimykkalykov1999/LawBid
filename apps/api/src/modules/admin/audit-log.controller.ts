import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { conditionalGet } from '../../common/sync/cheap-etag';
import { VersionEtagService } from '../../common/sync/version-etag.service';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  ALL_ADMIN_ROLES,
  AdminEndpoint,
  CurrentAdmin,
  Roles,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  AdminAccessReportService,
  previousMonth,
} from './admin-access-report.service';
import {
  AccessReportDto,
  AccessReportQueryDto,
  ChainCheckDto,
  AuditLogEntryDto,
  AuditLogQueryDto,
  type AuditLogPage,
} from './admin.dto';
import { AuditLogQueryService } from './audit-log.service';

/** docs/06 §2.3 item 12 — every role; non-super_admins see their own rows. */
@ApiTags('admin-audit-log')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@Controller('admin/audit-log')
export class AuditLogController {
  constructor(
    private readonly auditLog: AuditLogQueryService,
    private readonly chain: AuditLogService,
    private readonly report: AdminAccessReportService,
    private readonly versionEtag: VersionEtagService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Audit log, newest first (cursor)' })
  @ApiEnvelopeResponse(AuditLogEntryDto, { isArray: true })
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  async listAuditLog(
    @CurrentAdmin() actor: AdminActor,
    @Query() query: AuditLogQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuditLogPage | undefined> {
    // Speed matrix 2026-11-09 (§3 #4): the newest row's time is the tag
    // (everybody's rows, or this admin's own — the same rule as the list).
    const seesAll =
      actor.adminRole === 'super_admin' ||
      actor.permissions?.audit !== undefined;
    return conditionalGet(
      req,
      res,
      await this.versionEtag.adminAuditLog(seesAll ? null : actor.id),
      () => Promise.resolve(),
      () => this.auditLog.list(actor, query),
    );
  }

  @Get('access-report')
  @Roles('super_admin')
  @ApiOperation({
    summary:
      'Owner 2026-10-28: who read private content in a month, how often and why',
  })
  @ApiEnvelopeResponse(AccessReportDto)
  @ApiErrors({ 400: [ErrorCode.VALIDATION_ERROR] })
  async accessReport(
    @Query() query: AccessReportQueryDto,
  ): Promise<AccessReportDto> {
    const month = query.month ?? previousMonth(new Date());
    const built = await this.report.build(month);
    if (!built) throw new BadRequestException('Bad month.');
    return built;
  }

  @Get('verify-chain')
  @Roles('super_admin')
  @ApiOperation({
    summary:
      'Owner 2026-10-28: re-check the audit log hash chain (each row stores the hash of the previous one)',
  })
  @ApiEnvelopeResponse(ChainCheckDto)
  verifyChain(): Promise<ChainCheckDto> {
    return this.chain.verifyChain();
  }
}
