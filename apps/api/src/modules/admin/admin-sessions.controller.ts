import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
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
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminOkDto } from '../admin-auth/admin-auth.dto';
import { AdminSessionIdParamDto, AdminSessionRowDto } from './admin.dto';
import { AdminSessionsService } from './admin-sessions.service';

/** Owner 2026-10-02: the super admin watches every admin session. */
@ApiTags('admin-sessions')
@AdminEndpoint('super_admin')
@SkipAutoAudit()
@Controller('admin/sessions')
export class AdminSessionsController {
  constructor(private readonly sessions: AdminSessionsService) {}

  @Get()
  @ApiOperation({
    summary: 'Live admin sessions: who, since when, where from, last action',
  })
  @ApiEnvelopeResponse(AdminSessionRowDto, { isArray: true })
  listAdminSessions(
    @CurrentAdmin() actor: AdminActor,
  ): Promise<AdminSessionRowDto[]> {
    return this.sessions.list(actor);
  }

  @Post(':sessionId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'End one admin session at once' })
  @ApiEnvelopeResponse(AdminOkDto)
  @ApiErrors({ 404: [ErrorCode.NOT_FOUND] })
  async revokeAdminSession(
    @CurrentAdmin() actor: AdminActor,
    @Param() params: AdminSessionIdParamDto,
  ): Promise<AdminOkDto> {
    await this.sessions.revoke(actor, params.sessionId);
    return { ok: true };
  }
}
