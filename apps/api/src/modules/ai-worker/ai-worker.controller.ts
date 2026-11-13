import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Patch,
  Post,
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
  CurrentAdmin,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { AiAttachmentError } from '../ai-attachments/ai-attachments.logic';
import {
  AiRoleIdParamDto,
  ApproveBulkAiItemsDto,
  AiWorkerIdDto,
  AiWorkerItemsDto,
  AiWorkerItemsQueryDto,
  AiWorkerReviewedDto,
  AiWorkerRunStartedDto,
  AiWorkerStatusDto,
  CreateAiRoleDto,
  ReviewAiItemsDto,
  StartAiRunDto,
  UpdateAiRoleDto,
} from './ai-worker.dto';
import { AiWorkerError, AiWorkerService } from './ai-worker.service';

/**
 * Owner 2026-11-12 «ИИ-сотрудник»: Система → «ИИ-сотрудник». ADMIN ONLY and
 * OWNER ONLY: `@AdminEndpoint('super_admin')` (the same owner check as the
 * owner exemptions) — other staff get 403, the app and the web have no route
 * at all. Every change needs a fresh 2FA step-up; every mutating request is
 * an audit row (AdminAuditInterceptor).
 */
/**
 * Belt and braces on top of the guard: the trusted deputy may READ owner-only
 * pages through AdminAuthGuard; this page is the owner's alone.
 */
export function ownerOnly(admin: Pick<AdminActor, 'adminRole'>): void {
  if (admin.adminRole !== 'super_admin') {
    throw new ForbiddenException({
      code: E.FORBIDDEN,
      message: 'Только владелец.',
    });
  }
}

@ApiTags('admin-ai-worker')
@AdminEndpoint('super_admin')
@Controller('admin/ai-worker')
export class AiWorkerController {
  constructor(
    private readonly worker: AiWorkerService,
    private readonly auth: AdminAuthService,
  ) {}

  // flag: none owner only; every AI call is gated by the staff.ai_enabled master switch
  @Get()
  @ApiOperation({ summary: 'AI worker: roles, runs, money, proposals' })
  @ApiEnvelopeResponse(AiWorkerStatusDto)
  getAiWorker(@CurrentAdmin() admin: AdminActor): Promise<AiWorkerStatusDto> {
    ownerOnly(admin);
    return this.worker.status();
  }

  // flag: none owner only
  @Get('items')
  @ApiOperation({ summary: 'AI worker: the review queue (proposals)' })
  @ApiEnvelopeResponse(AiWorkerItemsDto)
  getAiWorkerItems(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: AiWorkerItemsQueryDto,
  ): Promise<AiWorkerItemsDto> {
    ownerOnly(admin);
    return this.worker.items(q);
  }

  // flag: none owner only, fresh 2FA
  @Post('roles')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI worker: write a role once' })
  @ApiEnvelopeResponse(AiWorkerIdDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async createAiRole(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: CreateAiRoleDto,
  ): Promise<AiWorkerIdDto> {
    ownerOnly(admin);
    await this.auth.assertStepUp(admin.sessionId);
    return this.wrap(() => this.worker.createRole(admin.id, dto));
  }

  // flag: none owner only, fresh 2FA
  @Patch('roles/:id')
  @ApiOperation({ summary: 'AI worker: change a role' })
  @ApiEnvelopeResponse(AiWorkerIdDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED], 404: [E.NOT_FOUND] })
  async updateAiRole(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AiRoleIdParamDto,
    @Body() dto: UpdateAiRoleDto,
  ): Promise<AiWorkerIdDto> {
    ownerOnly(admin);
    await this.auth.assertStepUp(admin.sessionId);
    return this.wrap(() => this.worker.updateRole(p.id, dto, admin.id));
  }

  // flag: none owner only, fresh 2FA
  @Post('roles/:id/archive')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'AI worker: «Удалить» a role (soft delete; its runs stop, history stays until the retention cleanup)',
  })
  @ApiEnvelopeResponse(AiWorkerIdDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED], 404: [E.NOT_FOUND] })
  async archiveAiRole(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AiRoleIdParamDto,
  ): Promise<AiWorkerIdDto> {
    ownerOnly(admin);
    await this.auth.assertStepUp(admin.sessionId);
    return this.worker.archiveRole(p.id);
  }

  // flag: none owner only, fresh 2FA; runs only with staff.ai_enabled on
  @Post('roles/:id/runs')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'AI worker: start a background mass run of a role',
  })
  @ApiEnvelopeResponse(AiWorkerRunStartedDto)
  @ApiErrors({
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
    409: [E.FEATURE_DISABLED],
  })
  async startAiRun(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AiRoleIdParamDto,
    @Body() dto: StartAiRunDto,
  ): Promise<AiWorkerRunStartedDto> {
    ownerOnly(admin);
    await this.auth.assertStepUp(admin.sessionId);
    return this.wrap(() => this.worker.startRun(admin.id, p.id, dto.limit));
  }

  // flag: none owner only, fresh 2FA
  @Post('runs/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'AI worker: stop a run' })
  @ApiEnvelopeResponse(AiWorkerIdDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED], 404: [E.NOT_FOUND] })
  async cancelAiRun(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: AiRoleIdParamDto,
  ): Promise<AiWorkerIdDto> {
    ownerOnly(admin);
    await this.auth.assertStepUp(admin.sessionId);
    return this.worker.cancelRun(p.id);
  }

  // flag: none owner only, fresh 2FA
  @Post('items/review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'AI worker: approve or reject proposals (one or many)',
  })
  @ApiEnvelopeResponse(AiWorkerReviewedDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async reviewAiItems(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: ReviewAiItemsDto,
  ): Promise<AiWorkerReviewedDto> {
    ownerOnly(admin);
    await this.auth.assertStepUp(admin.sessionId);
    return this.wrap(() => this.worker.review(admin.id, dto));
  }

  // flag: none owner only, fresh 2FA
  @Post('items/approve-bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'AI worker: approve the whole confident («bulk») list',
  })
  @ApiEnvelopeResponse(AiWorkerReviewedDto)
  @ApiErrors({ 403: [E.ADMIN_STEP_UP_REQUIRED] })
  async approveBulkAiItems(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: ApproveBulkAiItemsDto,
  ): Promise<AiWorkerReviewedDto> {
    ownerOnly(admin);
    await this.auth.assertStepUp(admin.sessionId);
    return this.worker.approveBulk(admin.id, dto.runId);
  }

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof AiAttachmentError) {
        throw new HttpException(
          { code: E.VALIDATION_ERROR, message: e.message },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (e instanceof AiWorkerError) {
        throw new HttpException(
          {
            code:
              e.kind === 'disabled' ? E.FEATURE_DISABLED : E.VALIDATION_ERROR,
            message: e.message,
          },
          e.kind === 'disabled' ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST,
        );
      }
      throw e;
    }
  }
}
