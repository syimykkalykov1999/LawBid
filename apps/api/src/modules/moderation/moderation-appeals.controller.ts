import {
  Body,
  Controller,
  Get,
  Inject,
  Optional,
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
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  CurrentUser,
  type RequestUser,
} from '../auth/decorators/current-user.decorator';
import {
  AppealDecisionDto,
  AppealDecisionResultDto,
  AppealIdParamDto,
  AppealItemDto,
  AppealQueueQueryDto,
  CreateAppealDto,
  JournalItemDto,
  JournalQueryDto,
  ModerationNoticeDto,
  MyReportDto,
} from './moderation-appeals.dto';
import { LEASE_PORT, type LeasePort } from '../staff-core/lease.port';
import { closeStaffDecision } from '../staff-core/staff-decision';
import { ModerationAppealsService } from './moderation-appeals.service';

const E = ErrorCode;

/** Owner 2026-10-20: what moderation did to my content, and an appeal. */
@ApiTags('moderation')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('moderation')
export class ModerationNoticesController {
  constructor(private readonly appeals: ModerationAppealsService) {}

  @Get('notices')
  @ApiOperation({
    summary: 'Moderation decisions on my posts, comments and messages',
  })
  @ApiEnvelopeResponse(ModerationNoticeDto, { isArray: true })
  moderationNotices(
    @CurrentUser() user: RequestUser,
  ): Promise<ModerationNoticeDto[]> {
    return this.appeals.notices(user.sub);
  }

  @Post('appeals')
  @ApiOperation({ summary: 'Ask moderation to look at a decision again' })
  @ApiEnvelopeResponse(ModerationNoticeDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.APPEAL_NOT_ALLOWED],
  })
  createModerationAppeal(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateAppealDto,
  ): Promise<ModerationNoticeDto> {
    return this.appeals.appeal(user.sub, dto.actionId, dto.message);
  }
}

/** Owner 2026-10-20: "my reports" with their status. */
@ApiTags('reports')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('reports')
export class MyReportsController {
  constructor(private readonly appeals: ModerationAppealsService) {}

  @Get('mine')
  @ApiOperation({ summary: 'My reports and where they stand (last 50)' })
  @ApiEnvelopeResponse(MyReportDto, { isArray: true })
  listMyReports(@CurrentUser() user: RequestUser): Promise<MyReportDto[]> {
    return this.appeals.myReports(user.sub);
  }
}

/** Owner 2026-10-20: appeals queue and the decisions journal. */
@ApiTags('admin-moderation')
@AdminEndpoint('super_admin', 'moderator')
@Controller('admin/moderation')
export class AdminAppealsController {
  constructor(
    private readonly appeals: ModerationAppealsService,
    // Staff package T4: a decision ends the moderator's work lease.
    @Optional() @Inject(LEASE_PORT) private readonly lease?: LeasePort,
  ) {}

  @Get('appeals')
  @ApiOperation({ summary: 'Appeals against moderation decisions' })
  @ApiEnvelopeResponse(AppealItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  moderationAppealsQueue(
    @CurrentAdmin() admin: AdminActor,
    @Query() query: AppealQueueQueryDto,
  ): Promise<{ items: AppealItemDto[]; nextCursor: string | null }> {
    return this.appeals.queue(query, admin.countries);
  }

  @Post('appeals/:id/decision')
  @SkipAutoAudit()
  @ApiOperation({
    summary: 'Accept (restores the content) or reject an appeal; note required',
  })
  @ApiEnvelopeResponse(AppealDecisionResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.APPEAL_NOT_ALLOWED, E.MODERATION_ACTION_NOT_APPLICABLE],
  })
  async decideModerationAppeal(
    @CurrentAdmin() admin: AdminActor,
    @Param() params: AppealIdParamDto,
    @Body() dto: AppealDecisionDto,
  ): Promise<AppealDecisionResultDto> {
    const status = await this.appeals.decide(
      admin,
      params.id,
      dto.accept,
      dto.note,
    );
    await closeStaffDecision(
      { lease: this.lease },
      {
        adminId: admin.id,
        kind: 'mod_appeal',
        itemId: params.id,
        outcome: dto.accept ? 'accept' : 'reject',
      },
    );
    return { status };
  }

  @Get('journal')
  @ApiOperation({ summary: 'Journal of moderation decisions, newest first' })
  @ApiEnvelopeResponse(JournalItemDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  moderationJournal(
    @Query() query: JournalQueryDto,
  ): Promise<{ items: JournalItemDto[]; nextCursor: string | null }> {
    return this.appeals.journal(query);
  }
}
