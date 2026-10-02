import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  Roles,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  AdminCaseActionDto,
  AdminCaseCardDto,
  AdminCaseRowDto,
  AdminCasesQueryDto,
  AdminIdParamDto,
  type Page,
} from './admin-cases.dto';
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
  constructor(private readonly cases: AdminCaseManagementService) {}

  @Get()
  @ApiOperation({ summary: 'All cases, newest first (filters + search)' })
  @ApiEnvelopeResponse(AdminCaseRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listAdminCases(
    @Query() q: AdminCasesQueryDto,
  ): Promise<Page<AdminCaseRowDto>> {
    return this.cases.list(q);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Case card: description, bids, journal, reports, disputes',
  })
  @ApiEnvelopeResponse(AdminCaseCardDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.CASE_NOT_FOUND] })
  getAdminCase(@Param() p: AdminIdParamDto): Promise<AdminCaseCardDto> {
    return this.cases.card(p.id);
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
