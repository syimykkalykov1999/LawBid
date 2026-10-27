import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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
import { AutoAppealsService } from './auto-appeals.service';
import { AutoModerationService } from './auto-moderation.service';
import {
  AppealMessageDto,
  AutoActionDto,
  AutoActionsQueryDto,
  AutoMetricsDto,
  DecisionDto,
  IdParamDto,
  MetricsQueryDto,
  MyStandingDto,
  NoteDto,
  ReporterRowDto,
  ReportersQueryDto,
  ReportingStatusDto,
  RestrictReporterDto,
  StatusResultDto,
  StrikeDto,
  StrikesQueryDto,
  UserIdParamDto,
} from './report-abuse.dto';
import { ReporterReputationService } from './reporter-reputation.service';
import { StrikesService } from './strikes.service';

const E = ErrorCode;

/** Owner 2026-10-27: my strikes and limits, my reporting status, and the
 * appeals of automatic decisions. */
@ApiTags('moderation')
@ApiBearerAuth()
@ApiErrors(AUTHENTICATED_ERRORS)
@Controller('moderation')
export class MyStandingController {
  constructor(
    private readonly strikes: StrikesService,
    private readonly reporters: ReporterReputationService,
    private readonly appeals: AutoAppealsService,
  ) {}

  @Get('standing')
  @ApiOperation({
    summary:
      'My strikes, current limit, reporting status and automatic decisions',
  })
  @ApiEnvelopeResponse(MyStandingDto)
  async myStanding(@CurrentUser() user: RequestUser): Promise<MyStandingDto> {
    const [strikes, reporting, autoActions] = await Promise.all([
      this.strikes.standing(user.sub),
      this.reporters.status(user.sub),
      this.appeals.mine(user.sub),
    ]);
    return { strikes, reporting, autoActions };
  }

  @Post('reporting-appeal')
  @ApiOperation({ summary: 'Appeal a warning or pause of my reports' })
  @ApiEnvelopeResponse(ReportingStatusDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 409: [E.APPEAL_NOT_ALLOWED] })
  appealReporting(
    @CurrentUser() user: RequestUser,
    @Body() dto: AppealMessageDto,
  ): Promise<ReportingStatusDto> {
    return this.reporters.appeal(user.sub, dto.message);
  }

  @Post('auto-actions/:id/appeal')
  @ApiOperation({ summary: 'Appeal an automatic moderation decision' })
  @ApiEnvelopeResponse(AutoActionDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.APPEAL_NOT_ALLOWED],
  })
  appealAuto(
    @CurrentUser() user: RequestUser,
    @Param() params: IdParamDto,
    @Body() dto: AppealMessageDto,
  ): Promise<AutoActionDto> {
    return this.appeals.appeal(user.sub, params.id, dto.message);
  }
}

/** Owner 2026-10-27: reporters, strikes and automatic decisions for
 * moderators (super_admin and moderator; sign-in 2FA is the only gate). */
@ApiTags('admin-moderation')
@AdminEndpoint('super_admin', 'moderator')
@Controller('admin/moderation')
export class AdminReportAbuseController {
  constructor(
    private readonly strikes: StrikesService,
    private readonly reporters: ReporterReputationService,
    private readonly appeals: AutoAppealsService,
    private readonly auto: AutoModerationService,
  ) {}

  @Get('reporters')
  @ApiOperation({
    summary: 'Reporters by how many of their reports were dismissed',
  })
  @ApiEnvelopeResponse(ReporterRowDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listReporters(
    @CurrentAdmin() admin: AdminActor,
    @Query() q: ReportersQueryDto,
  ): Promise<ReporterRowDto[]> {
    return this.reporters.list(q, admin.countries);
  }

  @Post('reporters/:userId/clear')
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Lift a reporter warning or pause' })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async clearReporter(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: UserIdParamDto,
    @Body() dto: NoteDto,
  ): Promise<{ ok: true }> {
    await this.reporters.clear(admin, p.userId, dto.note);
    return { ok: true };
  }

  @Post('reporters/:userId/restrict')
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Pause a reporter by hand' })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async restrictReporter(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: UserIdParamDto,
    @Body() dto: RestrictReporterDto,
  ): Promise<{ ok: true }> {
    await this.reporters.restrict(admin, p.userId, dto.days, dto.note);
    return { ok: true };
  }

  @Post('reporters/:userId/appeal-decision')
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Approve or reject a reporter appeal' })
  @ApiEnvelopeResponse(StatusResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.APPEAL_NOT_ALLOWED],
  })
  async decideReporterAppeal(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: UserIdParamDto,
    @Body() dto: DecisionDto,
  ): Promise<StatusResultDto> {
    const status = await this.reporters.decideAppeal(
      admin,
      p.userId,
      dto.accept,
      dto.note,
    );
    return { status };
  }

  @Get('strikes')
  @ApiOperation({ summary: 'Strikes (all, or of one user)' })
  @ApiEnvelopeResponse(StrikeDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listStrikes(@Query() q: StrikesQueryDto): Promise<StrikeDto[]> {
    return this.strikes.list(q);
  }

  @Post('strikes/:id/revoke')
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Revoke a strike (lifts its limit)' })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async revokeStrike(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: IdParamDto,
    @Body() dto: NoteDto,
  ): Promise<{ ok: true }> {
    await this.strikes.revoke(admin, p.id, dto.note);
    return { ok: true };
  }

  @Get('auto-actions')
  @ApiOperation({
    summary:
      'Automatic decisions: waiting appeals, decided ones, or the priority-review list',
  })
  @ApiEnvelopeResponse(AutoActionDto, { isArray: true })
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  listAuto(@Query() q: AutoActionsQueryDto): Promise<AutoActionDto[]> {
    return this.appeals.queue(q);
  }

  @Post('auto-actions/:id/decision')
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'Approve (restores account, content and strikes) or reject an appeal',
  })
  @ApiEnvelopeResponse(StatusResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    404: [E.NOT_FOUND],
    409: [E.APPEAL_NOT_ALLOWED],
  })
  async decideAuto(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: IdParamDto,
    @Body() dto: DecisionDto,
  ): Promise<StatusResultDto> {
    const status = await this.appeals.decide(admin, p.id, dto.accept, dto.note);
    return { status };
  }

  @Post('auto-actions/:id/close-review')
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Close a priority-review entry' })
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async closeReview(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: IdParamDto,
    @Body() dto: NoteDto,
  ): Promise<{ ok: true }> {
    await this.appeals.closeReview(admin, p.id, dto.note);
    return { ok: true };
  }

  @Get('auto-metrics')
  @ApiOperation({
    summary:
      'Automatic actions per day, appeal rate, overturn rate and the alarm',
  })
  @ApiEnvelopeResponse(AutoMetricsDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR] })
  autoMetrics(@Query() q: MetricsQueryDto): Promise<AutoMetricsDto> {
    return this.auto.metrics(q.days ?? 14);
  }
}
