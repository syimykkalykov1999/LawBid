import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Optional,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { conditionalGet } from '../../common/sync/cheap-etag';
import { VersionEtagService } from '../../common/sync/version-etag.service';
import { shardContext } from '../../sharding/shard-context';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  Justification,
  Roles,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import {
  AdminCaseActionDto,
  AdminCaseCardDto,
  AdminCaseRowDto,
  AdminCasesQueryDto,
  AdminIdParamDto,
  type Page,
  AdminCasesBulkDto,
  AdminCasesBulkPreviewDto,
} from './admin-cases.dto';
import {
  AdminBulkFilterPreviewDto,
  AdminBulkResultDto,
  BULK_MAX,
} from '../admin-content/admin-content.dto';
import { eachIdInChunks } from '../admin-content/bulk.util';
import {
  bulkFilterPreview,
  bulkTargets,
} from '../../common/admin-bulk/bulk-filter';
import { AppSettingsService } from '../../common/app-settings/app-settings.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import { AdminCaseManagementService } from './admin-case-management.service';

const E = ErrorCode;
const ACTION_ERRORS = {
  400: [E.VALIDATION_ERROR],
  404: [E.CASE_NOT_FOUND],
  409: [E.CASE_INVALID_STATE, E.BID_INVALID_STATE],
};

/** Audit 2026-10-02 — admin panel → Cases: support and super_admin act,
 * moderators read. Actions write their own audit rows (reason ≥ 10). */
@ApiTags('admin-cases')
@AdminEndpoint('super_admin', 'support', 'moderator')
@Controller('admin/cases')
export class AdminCaseManagementController {
  constructor(
    private readonly cases: AdminCaseManagementService,
    private readonly versionEtag: VersionEtagService,
    private readonly auth: AdminAuthService,
    // Row 179 B6: «select all by filter» audits the filter once.
    @Optional() private readonly audit?: AuditLogService,
    @Optional() private readonly settings?: AppSettingsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'All cases, newest first (filters + search)' })
  @ApiEnvelopeResponse(AdminCaseRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  async listAdminCases(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: AdminCasesQueryDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<Page<AdminCaseRowDto> | undefined> {
    // Speed matrix 2026-11-09 (§3 #4): cheap tag before the list → 304.
    return conditionalGet(
      req,
      res,
      await this.versionEtag.adminCases(admin.countries ?? null),
      () => Promise.resolve(),
      () => this.cases.list(q, admin.countries),
    );
  }

  // Owner 2026-10-28 (privilege): the card carries the client's private
  // details, description, journal and bids, so opening it needs a reason
  // that is written to the audit log. Moderators additionally never get
  // `privateDetails` without that reason.
  @Get(':id')
  @Justification()
  @ApiOperation({
    summary: 'Case card: description, bids, journal, reports, disputes',
  })
  @ApiEnvelopeResponse(AdminCaseCardDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.CASE_NOT_FOUND] })
  getAdminCase(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminIdParamDto,
  ): Promise<AdminCaseCardDto> {
    return this.cases.card(p.id, admin.countries, {
      includePrivateDetails:
        admin.adminRole !== 'moderator' || !!admin.justification,
    });
  }

  @Post('bulk/preview')
  @Roles('super_admin', 'support')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Row 179 B6: how many cases the list filter matches (read-only, before a bulk action)',
  })
  @ApiEnvelopeResponse(AdminBulkFilterPreviewDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 403: [E.FORBIDDEN] })
  previewAdminCasesBulk(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: AdminCasesBulkPreviewDto,
  ): Promise<AdminBulkFilterPreviewDto> {
    return bulkFilterPreview(admin, this.settings, (cap) =>
      this.cases.idsByFilter(dto.filter, admin.countries ?? null, cap),
    );
  }

  @Post('bulk')
  @Roles('super_admin', 'support')
  @SkipAutoAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Owner 2026-10-04: hide / close / archive / restore many cases (staff up to 500, the owner any number); one reason, audited and told per case',
  })
  @ApiEnvelopeResponse(AdminBulkResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.FORBIDDEN, E.ADMIN_STEP_UP_REQUIRED],
  })
  async bulkAdminCases(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: AdminCasesBulkDto,
  ): Promise<AdminBulkResultDto> {
    // Round 4 (25.11, С5): up to 500 cases at once — the same fresh code
    // the bulk actions with people ask.
    await this.auth.assertStepUp(admin.sessionId);
    // Owner 2026-11-12: staff keep 500 cases a request; the owner sends
    // any number, worked through in chunks. Each case runs in its own
    // shard (its id carries it). Row 179 B6: or the list's filter,
    // resolved here (staff: `admin.bulk_select_cap`).
    const ids = await bulkTargets({
      admin,
      ids: dto.ids,
      filter: dto.filter,
      staffMax: BULK_MAX,
      settings: this.settings,
      resolve: (cap) =>
        this.cases.idsByFilter(dto.filter!, admin.countries ?? null, cap),
      audit: this.audit,
      auditAction: 'admin.cases.bulk_filter',
      targetType: 'case_filter',
      bulkAction: dto.action,
    });
    return eachIdInChunks(ids, (id) =>
      shardContext.runForCase(id, () =>
        this.cases.act(admin, id, dto.action, dto.reason),
      ),
    );
  }

  @Post(':id/hide')
  @Roles('super_admin', 'support')
  @SkipAutoAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Hide an open case (archived: out of the feed, bids rejected, client told why)',
  })
  @ApiEnvelopeResponse(AdminCaseCardDto)
  @ApiErrors(ACTION_ERRORS)
  hideAdminCase(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminIdParamDto,
    @Body() dto: AdminCaseActionDto,
  ): Promise<AdminCaseCardDto> {
    return this.cases.act(admin, p.id, 'hide', dto.reason);
  }

  @Post(':id/close')
  @Roles('super_admin', 'support')
  @SkipAutoAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Close an open case (active bids rejected)' })
  @ApiEnvelopeResponse(AdminCaseCardDto)
  @ApiErrors(ACTION_ERRORS)
  closeAdminCase(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminIdParamDto,
    @Body() dto: AdminCaseActionDto,
  ): Promise<AdminCaseCardDto> {
    return this.cases.act(admin, p.id, 'close', dto.reason);
  }

  @Post(':id/archive')
  @Roles('super_admin', 'support')
  @SkipAutoAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Archive an open case (active bids rejected)' })
  @ApiEnvelopeResponse(AdminCaseCardDto)
  @ApiErrors(ACTION_ERRORS)
  archiveAdminCase(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminIdParamDto,
    @Body() dto: AdminCaseActionDto,
  ): Promise<AdminCaseCardDto> {
    return this.cases.act(admin, p.id, 'archive', dto.reason);
  }

  @Post(':id/restore')
  @Roles('super_admin', 'support')
  @SkipAutoAudit()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore an archived (or hidden) case to open' })
  @ApiEnvelopeResponse(AdminCaseCardDto)
  @ApiErrors(ACTION_ERRORS)
  restoreAdminCase(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AdminIdParamDto,
    @Body() dto: AdminCaseActionDto,
  ): Promise<AdminCaseCardDto> {
    return this.cases.act(admin, p.id, 'restore', dto.reason);
  }
}
