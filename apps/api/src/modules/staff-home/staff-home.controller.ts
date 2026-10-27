import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
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
import { AdminAuthService } from '../admin-auth/admin-auth.service';
import { StaffSettingsService } from '../staff-core/staff-settings.service';
import { StaffDecisionService } from './staff-decision.service';
import { StaffDigestService } from './staff-digest.service';
import {
  StaffAdminParamHomeDto,
  StaffDecideSuggestionDto,
  StaffDecideSuggestionResultDto,
  StaffDigestListDto,
  StaffPersonHistoryDto,
  StaffSuggestionParamDto,
  StaffTodayDto,
} from './staff-home.dto';
import { StaffPersonCardService } from './staff-person-card.service';
import { StaffTodayService } from './staff-today.service';

const notFound = () =>
  new NotFoundException({ code: E.NOT_FOUND, message: 'Not found.' });

/**
 * Staff package T10 (plan B4): the owner's «Сегодня», the weekly digest, the
 * rest of a person's card and the button under a suggestion. Super admin only
 * (the guard answers 404 to everybody else); each route also answers 404
 * while its own switch is off, so with everything off the admin is unchanged.
 * `today` reads one stored snapshot (Redis), never the big tables.
 */
// flag: staff.owner_home_enabled / staff.weekly_digest_enabled / staff.rating_enabled — off answers 404
@ApiTags('admin-staff')
@AdminEndpoint('super_admin')
@Controller('admin/staff')
export class StaffHomeController {
  constructor(
    private readonly settings: StaffSettingsService,
    private readonly today: StaffTodayService,
    private readonly digest: StaffDigestService,
    private readonly card: StaffPersonCardService,
    private readonly decisions: StaffDecisionService,
    private readonly auth: AdminAuthService,
  ) {}

  @Get('today')
  @ApiOperation({
    summary: 'The owner «Сегодня»: what needs attention (one stored snapshot)',
  })
  @ApiEnvelopeResponse(StaffTodayDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async staffToday(): Promise<StaffTodayDto> {
    if (!(await this.settings.isOn('staff.owner_home_enabled'))) {
      throw notFound();
    }
    return this.today.read();
  }

  @Get('digest')
  @ApiOperation({ summary: 'The weekly «5 чисел» (last 8 weeks)' })
  @ApiEnvelopeResponse(StaffDigestListDto)
  @ApiErrors({ 404: [E.NOT_FOUND] })
  async staffDigest(): Promise<StaffDigestListDto> {
    if (!(await this.settings.isOn('staff.weekly_digest_enabled'))) {
      throw notFound();
    }
    return this.digest.list();
  }

  @Get('people/:adminId/history')
  @ApiOperation({
    summary:
      'A person: state, 30-day signals, last actions and the text of open suggestions',
  })
  @ApiEnvelopeResponse(StaffPersonHistoryDto)
  @ApiErrors({ 400: [E.VALIDATION_ERROR], 404: [E.NOT_FOUND] })
  staffPersonHistory(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: StaffAdminParamHomeDto,
  ): Promise<StaffPersonHistoryDto> {
    return this.card.history(admin, p.adminId);
  }

  @Post('suggestions/:id/decide')
  @HttpCode(200)
  @SkipAutoAudit()
  @ApiOperation({
    summary:
      'Apply or dismiss a suggestion; applying needs a fresh 2FA code and is journaled',
  })
  @ApiEnvelopeResponse(StaffDecideSuggestionResultDto)
  @ApiErrors({
    400: [E.VALIDATION_ERROR],
    403: [E.ADMIN_STEP_UP_REQUIRED],
    404: [E.NOT_FOUND],
  })
  async decideStaffSuggestion(
    @CurrentAdmin() admin: AdminActor,
    @Param() p: StaffSuggestionParamDto,
    @Body() dto: StaffDecideSuggestionDto,
  ): Promise<StaffDecideSuggestionResultDto> {
    if (dto.action === 'apply') {
      // 404 first for anybody who is not the owner, then the code.
      if (admin.adminRole !== 'super_admin') throw notFound();
      await this.auth.assertStepUp(admin.sessionId);
    }
    return this.decisions.decide(admin, p.id, dto);
  }
}
