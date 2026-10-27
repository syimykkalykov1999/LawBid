import {
  Body,
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
import { ErrorCode as E } from '../../common/errors/error-code.enum';
import {
  AdminEndpoint,
  CurrentAdmin,
  SkipAutoAudit,
  type AdminActor,
} from '../admin-auth/admin-auth.decorators';
import {
  ReviewCurrentDto,
  ReviewGoldenBodyDto,
  ReviewGoldenIssuedDto,
  ReviewGoldenListDto,
  ReviewMeDto,
  ReviewNextDto,
  ReviewSampleParamDto,
  ReviewStatsDto,
  ReviewTeamDto,
  ReviewVerdictBodyDto,
  ReviewVerdictResultDto,
} from './staff-review.dto';
import { StaffReviewAccessService } from './staff-review-access.service';
import { StaffReviewReadService } from './staff-review-read.service';
import { StaffReviewService } from './staff-review.service';

/**
 * Staff package T9 (the re-check loop): `admin/workspace/review/*`. The
 * owner, a workspace head and a senior worker re-check a share of closed
 * decisions AFTER the fact (never an approval step). Everything else — a
 * plain worker, and every request while `staff.rating_enabled` or
 * `staff.sampling_enabled` is off — answers «not found». Golden marking,
 * the team view and the stats are for the owner and heads only.
 */
// flag: staff.sampling_enabled (with staff.rating_enabled) — off (the default) answers 404, nothing is read
@ApiTags('admin-staff')
@AdminEndpoint('super_admin', 'moderator', 'verifier', 'support', 'finance')
@Controller('admin/workspace/review')
export class StaffReviewController {
  constructor(
    private readonly access: StaffReviewAccessService,
    private readonly review: StaffReviewService,
    private readonly read: StaffReviewReadService,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'May I re-check? (404 for everyone who may not)' })
  @ApiEnvelopeResponse(ReviewMeDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async reviewMe(@CurrentAdmin() admin: AdminActor): Promise<ReviewMeDto> {
    const a = await this.access.require(admin);
    return { level: a.level, canManage: a.level !== 'senior' };
  }

  @Post('next')
  @HttpCode(HttpStatus.OK)
  // the lease journal (work_lease_events) records this; a generic audit row per click adds nothing
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      '«Следующий» of the re-check: leases one pending sample to me (two reviewers never get the same one)',
  })
  @ApiEnvelopeResponse(ReviewNextDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async reviewNext(@CurrentAdmin() admin: AdminActor): Promise<ReviewNextDto> {
    return this.review.next(admin, await this.access.require(admin));
  }

  @Get('current')
  @ApiOperation({ summary: 'The sample I hold now, if any' })
  @ApiEnvelopeResponse(ReviewCurrentDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async reviewCurrent(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<ReviewCurrentDto> {
    return this.review.current(admin, await this.access.require(admin));
  }

  @Post(':id/verdict')
  @HttpCode(HttpStatus.OK)
  // the service writes its own audit row (verdict, reasons, kind)
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'Verdict on the sample I hold: confirmed / overturned (with reasons) / unclear',
  })
  @ApiEnvelopeResponse(ReviewVerdictResultDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async reviewVerdict(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: ReviewSampleParamDto,
    @Body() dto: ReviewVerdictBodyDto,
  ): Promise<ReviewVerdictResultDto> {
    await this.access.require(admin);
    return this.review.verdict(admin, p.id, dto);
  }

  @Post(':id/release')
  @HttpCode(HttpStatus.OK)
  @SkipAutoAudit()
  @ApiOperation({ summary: 'Let go of the sample without a verdict' })
  @ApiEnvelopeResponse(ReviewVerdictResultDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async reviewRelease(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: ReviewSampleParamDto,
  ): Promise<ReviewVerdictResultDto> {
    await this.access.require(admin);
    const ok = await this.review.release(admin, p.id);
    return { ok, result: 'returned' };
  }

  @Get('golden')
  @ApiOperation({
    summary: 'Golden tasks and how workers did on them (owner, head)',
  })
  @ApiEnvelopeResponse(ReviewGoldenListDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async reviewGolden(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<ReviewGoldenListDto> {
    return this.read.golden(await this.access.requireHead(admin));
  }

  @Post('golden')
  @HttpCode(HttpStatus.OK)
  // the service writes its own audit row
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'Mark a confirmed decision as a golden task for a worker (owner, head)',
  })
  @ApiEnvelopeResponse(ReviewGoldenIssuedDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  async reviewMarkGolden(
    @CurrentAdmin() admin: AdminActor,
    @Body() dto: ReviewGoldenBodyDto,
  ): Promise<ReviewGoldenIssuedDto> {
    return this.review.markGolden(
      admin,
      await this.access.requireHead(admin),
      dto,
    );
  }

  @Get('team')
  @ApiOperation({
    summary:
      'Returned rate and re-check results per worker (latest nightly snapshot; owner, head)',
  })
  @ApiEnvelopeResponse(ReviewTeamDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async reviewTeam(@CurrentAdmin() admin: AdminActor): Promise<ReviewTeamDto> {
    return this.read.team(await this.access.requireHead(admin));
  }

  @Get('stats')
  @ApiOperation({
    summary:
      'Re-check numbers per workspace and reviewer calibration (owner: all, head: own workspace)',
  })
  @ApiEnvelopeResponse(ReviewStatsDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async reviewStats(
    @CurrentAdmin() admin: AdminActor,
  ): Promise<ReviewStatsDto> {
    return this.read.stats(await this.access.requireHead(admin));
  }
}
