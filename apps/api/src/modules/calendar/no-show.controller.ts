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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  AUTHENTICATED_ERRORS,
} from '../../common/dto/api-docs.decorators';
import { ErrorCode } from '../../common/errors/error-code.enum';
import { RateLimitService } from '../auth/services/rate-limit.service';
import { AuditLogService } from '../admin-access/audit-log.service';
import {
  AdminEndpoint,
  CurrentAdmin,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import {
  AdminNoShowDto,
  AdminNoShowsQueryDto,
  ConsultationNoShowParamDto,
  DisputeNoShowDto,
  NoShowInfoDto,
  ResolveNoShowDto,
} from './calendar.dto';
import { NoShowService } from './no-show.service';

const E = ErrorCode;
const ERRORS = {
  400: [E.VALIDATION_ERROR],
  403: [E.FORBIDDEN, E.FEATURE_DISABLED],
  404: [E.NOT_FOUND],
  409: [E.CONSULTATION_STATE_CONFLICT],
};

/** Owner 2026-10-28: «the other side did not come» (either side). */
@ApiTags('consultations')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('consultations')
export class NoShowController {
  constructor(private readonly noShows: NoShowService) {}

  @Get(':id/no-show')
  @ApiOperation({
    summary: 'No-show marks of a consultation (both sides see them)',
  })
  @ApiEnvelopeResponse(NoShowInfoDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  list(
    @CurrentUser() user: RequestUser,
    @Param() p: ConsultationNoShowParamDto,
  ) {
    return this.noShows.list(user, p.id);
  }

  @Post(':id/no-show')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Mark the other side as absent (after the grace window; they can dispute)',
  })
  @ApiEnvelopeResponse(NoShowInfoDto)
  @ApiErrors(ERRORS)
  mark(
    @CurrentUser() user: RequestUser,
    @Param() p: ConsultationNoShowParamDto,
  ) {
    return this.noShows.mark(user, p.id);
  }

  @Post(':id/no-show/dispute')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'I was there: dispute the mark against me' })
  @ApiEnvelopeResponse(NoShowInfoDto)
  @ApiErrors(ERRORS)
  dispute(
    @CurrentUser() user: RequestUser,
    @Param() p: ConsultationNoShowParamDto,
    @Body() dto: DisputeNoShowDto,
  ) {
    return this.noShows.dispute(user, p.id, dto.reason);
  }

  @Post(':id/no-show/withdraw')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Take back my own mark' })
  @ApiEnvelopeResponse(NoShowInfoDto)
  @ApiErrors(ERRORS)
  withdraw(
    @CurrentUser() user: RequestUser,
    @Param() p: ConsultationNoShowParamDto,
  ) {
    return this.noShows.withdraw(user, p.id);
  }
}

/** Owner 2026-10-28: staff decide a disputed mark (one fresh 2FA, audited). */
@ApiTags('admin-consultations')
@AdminEndpoint('super_admin', 'moderator', 'support')
@Controller('admin/consultation-no-shows')
export class AdminNoShowController {
  constructor(
    private readonly noShows: NoShowService,
    private readonly audit: AuditLogService,
    private readonly auth: AdminAuthService,
    private readonly rateLimit: RateLimitService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Marks waiting for staff (default: disputed)' })
  @ApiEnvelopeResponse(AdminNoShowDto, { isArray: true })
  async list(@Query() q: AdminNoShowsQueryDto): Promise<AdminNoShowDto[]> {
    const rows = await this.noShows.adminList(q.state);
    return rows.map((r) => this.dto(r));
  }

  @Post(':id/resolve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Uphold or overturn a mark (needs step-up)' })
  @ApiEnvelopeResponse(AdminNoShowDto)
  @ApiErrors({
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
    409: [E.CONSULTATION_STATE_CONFLICT],
  })
  async resolve(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: ConsultationNoShowParamDto,
    @Body() dto: ResolveNoShowDto,
  ): Promise<AdminNoShowDto> {
    await this.auth.assertStepUp(admin.sessionId);
    await this.rateLimit.consumeFixedWindow(['adm-noshow', admin.id], 60, 3600);
    const row = await this.noShows.adminResolve(
      p.id,
      dto.decision,
      admin.id,
      dto.note,
    );
    await this.audit.record({
      adminId: admin.id,
      action: `consultation_no_show.${dto.decision}`,
      targetType: 'consultation_no_show',
      targetId: row.id,
      before: null,
      after: { decision: dto.decision, state: row.state },
      ip: admin.ip,
    });
    return this.dto(row);
  }

  private dto(
    r: Awaited<ReturnType<NoShowService['adminList']>>[number],
  ): AdminNoShowDto {
    return {
      id: r.id,
      consultationId: r.consultation_id,
      absentSide: r.absent_side as AdminNoShowDto['absentSide'],
      absentUserId: r.absent_user_id,
      source: r.source as AdminNoShowDto['source'],
      markedById: r.marked_by_id,
      state: r.state as AdminNoShowDto['state'],
      markedAt: r.marked_at.toISOString(),
      disputeReason: r.dispute_reason,
      resolutionNote: r.resolution_note,
    };
  }
}
