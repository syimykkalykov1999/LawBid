import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode as E } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  ALL_ADMIN_ROLES,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { DmcaService } from './dmca.service';
import {
  AdminDmcaListQueryDto,
  AdminDmcaNoticeDetailDto,
  AdminDmcaNoticeRowDto,
  DmcaDecideDto,
  DmcaNoticeIdParamDto,
  LegalSettingsDto,
} from './legal.dto';
import { LegalService } from './legal.service';
import type { LegalSettings } from './legal.settings';

type Page<T> = { items: T[]; nextCursor: string | null };

/**
 * Owner 2026-10-05 (legal): Система → Право и жалобы. Same guard as
 * /admin/legal-documents: every role reaches the controller, the area
 * toggle `legal` (view / manage) decides per admin (admin-permissions.ts
 * maps the `legal` path segment to that area). The services write their
 * own audit rows (before/after).
 */
@ApiTags('admin-legal')
@AdminEndpoint(...ALL_ADMIN_ROLES)
@Controller('admin/legal')
export class AdminLegalController {
  constructor(
    private readonly legal: LegalService,
    private readonly dmca: DmcaService,
  ) {}

  @Get('settings')
  @ApiOperation({
    summary:
      'DMCA agent, incident contact, strikes threshold and the legal texts (en/ru)',
  })
  @ApiEnvelopeResponse(LegalSettingsDto)
  getAdminLegalSettings(): Promise<LegalSettings> {
    return this.legal.settings();
  }

  @Put('settings')
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Replace the legal settings (audited)' })
  @ApiEnvelopeResponse(LegalSettingsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  updateAdminLegalSettings(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: LegalSettingsDto,
  ): Promise<LegalSettings> {
    return this.legal.updateSettings(admin, dto);
  }

  @Get('dmca')
  @ApiOperation({ summary: 'DMCA notices, newest first (50 per page)' })
  @ApiEnvelopeResponse(AdminDmcaNoticeRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listAdminDmcaNotices(
    @Query() q: AdminDmcaListQueryDto,
  ): Promise<Page<AdminDmcaNoticeRowDto>> {
    return this.dmca.list(q);
  }

  @Get('dmca/:id')
  @ApiOperation({
    summary:
      'One notice with the moderation card of its target and the author strikes',
  })
  @ApiEnvelopeResponse(AdminDmcaNoticeDetailDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  getAdminDmcaNotice(
    @Param() params: DmcaNoticeIdParamDto,
  ): Promise<AdminDmcaNoticeDetailDto> {
    return this.dmca.detail(params.id);
  }

  @Post('dmca/:id/decide')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'remove (takes the content down, a strike for the author, suspension at the threshold) / reject / restore (after a counter-notice; the strike goes back)',
  })
  @ApiEnvelopeResponse(AdminDmcaNoticeRowDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.DMCA_INVALID_STATE, E.MODERATION_ACTION_NOT_APPLICABLE],
  })
  decideAdminDmcaNotice(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: DmcaNoticeIdParamDto,
    @Body() dto: DmcaDecideDto,
  ): Promise<AdminDmcaNoticeRowDto> {
    return this.dmca.decide(admin, params.id, dto);
  }
}
